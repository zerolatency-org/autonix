// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentIdentity} from "./AgentIdentity.sol";

/// @notice Holds payment for one agent-hires-agent job until an independent verifier
/// signs a pass/fail verdict against criteria that were committed BEFORE work started.
/// This is the direct answer to "what if the buyer just refuses to pay" — the buyer
/// has no function that releases or withholds funds by their own say-so. Only a
/// verdict signed by `verifier`, checked against the job's own criteriaHash, moves money.
///
/// Money model: pull payments only. `settle` and `claimTimeout` CREDIT a balance;
/// the recipient calls `withdraw()` themselves. This means a payee that reverts on
/// receiving funds can never block anyone else's settlement.
contract JobEscrow is EIP712, ReentrancyGuard, Ownable {
    enum Status {
        None,
        Open,
        Accepted,
        Delivered,
        Settled,
        Refunded
    }

    struct Job {
        address buyer;
        uint256 providerTokenId;
        address providerOwnerAtAccept;
        bytes32 criteriaHash;
        bytes32 resultHash;
        uint256 amountWei;
        uint64 acceptDeadline; // must be accepted by this time or buyer can reclaim
        uint64 deliverDeadline; // must be delivered by this time (0 = not set until accept)
        Status status;
    }

    AgentIdentity public immutable identity;
    address public verifier;
    uint96 public feeBps; // out of 10_000, taken from provider payout on settle
    address public feeRecipient;

    uint256 private _nextJobId = 1;
    mapping(uint256 => Job) public jobs;
    mapping(address => uint256) public balances;
    mapping(uint256 => bool) public usedNonces;

    uint64 public constant DELIVER_WINDOW = 1 days;

    bytes32 private constant VERDICT_TYPEHASH =
        keccak256("Verdict(uint256 jobId,bool pass,uint8 score,uint256 nonce)");

    event JobCreated(uint256 indexed jobId, address indexed buyer, uint256 indexed providerTokenId, bytes32 criteriaHash, uint256 amountWei, uint64 acceptDeadline);
    event JobAccepted(uint256 indexed jobId, address providerOwner, uint64 deliverDeadline);
    event JobDelivered(uint256 indexed jobId, bytes32 resultHash);
    event JobSettled(uint256 indexed jobId, bool pass, uint8 score);
    event JobRefundedByTimeout(uint256 indexed jobId);
    event Withdrawn(address indexed who, uint256 amountWei);
    event VerifierChanged(address verifier);
    event FeeChanged(uint96 feeBps, address feeRecipient);

    error InvalidAmount();
    error InvalidDeadline();
    error NotOpen();
    error NotAccepted();
    error NotDelivered();
    error NotProviderOwner();
    error NotBuyer();
    error AgentRetiredOrUnknown();
    error BadSignature();
    error NonceUsed();
    error DeadlineNotPassed();
    error DeadlineAlreadyPassed();
    error NothingToWithdraw();
    error TransferFailed();
    error FeeTooHigh();
    error ZeroAddress();

    constructor(address initialOwner, AgentIdentity identityContract, address initialVerifier)
        EIP712("AutonixJobEscrow", "1")
        Ownable(initialOwner)
    {
        if (address(identityContract) == address(0) || initialVerifier == address(0)) {
            revert ZeroAddress();
        }
        identity = identityContract;
        verifier = initialVerifier;
    }

    function setVerifier(address newVerifier) external onlyOwner {
        if (newVerifier == address(0)) revert ZeroAddress();
        verifier = newVerifier;
        emit VerifierChanged(newVerifier);
    }

    function setFee(uint96 newFeeBps, address newFeeRecipient) external onlyOwner {
        if (newFeeBps > 2_000) revert FeeTooHigh(); // cap at 20%, generous ceiling
        if (newFeeBps > 0 && newFeeRecipient == address(0)) revert ZeroAddress();
        feeBps = newFeeBps;
        feeRecipient = newFeeRecipient;
        emit FeeChanged(newFeeBps, newFeeRecipient);
    }

    /// @notice Buyer opens a job targeting a specific provider agent, funding it in full.
    /// `criteriaHash` is the commitment to acceptance criteria agreed before work starts —
    /// the verifier checks the delivery against this hash's off-chain content, never
    /// against anything the buyer says afterward.
    function createJob(uint256 providerTokenId, bytes32 criteriaHash, uint64 acceptDeadline)
        external
        payable
        returns (uint256 jobId)
    {
        if (msg.value == 0) revert InvalidAmount();
        // forge-lint: disable-next-line(block-timestamp)
        if (acceptDeadline <= block.timestamp) revert InvalidDeadline();
        if (identity.isRetired(providerTokenId)) revert AgentRetiredOrUnknown();

        jobId = _nextJobId++;
        jobs[jobId] = Job({
            buyer: msg.sender,
            providerTokenId: providerTokenId,
            providerOwnerAtAccept: address(0),
            criteriaHash: criteriaHash,
            resultHash: bytes32(0),
            amountWei: msg.value,
            acceptDeadline: acceptDeadline,
            deliverDeadline: 0,
            status: Status.Open
        });

        emit JobCreated(jobId, msg.sender, providerTokenId, criteriaHash, msg.value, acceptDeadline);
    }

    /// @notice Called by the provider agent's CURRENT owner. Snapshots that owner so a
    /// later sale of the agent mid-job cannot redirect payout — see `providerOwnerAtAccept`.
    function accept(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (job.status != Status.Open) revert NotOpen();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > job.acceptDeadline) revert DeadlineAlreadyPassed();

        address currentOwner = _ownerOfAgent(job.providerTokenId);
        if (msg.sender != currentOwner) revert NotProviderOwner();

        job.providerOwnerAtAccept = currentOwner;
        // casting to 'uint64' is safe because block.timestamp will not overflow uint64 for millennia
        // forge-lint: disable-next-line(unsafe-typecast)
        job.deliverDeadline = uint64(block.timestamp) + DELIVER_WINDOW;
        job.status = Status.Accepted;

        emit JobAccepted(jobId, currentOwner, job.deliverDeadline);
        identity.setJobDelta(job.providerTokenId, true);
    }

    function commitDelivery(uint256 jobId, bytes32 resultHash) external {
        Job storage job = jobs[jobId];
        if (job.status != Status.Accepted) revert NotAccepted();
        if (msg.sender != job.providerOwnerAtAccept) revert NotProviderOwner();

        job.resultHash = resultHash;
        job.status = Status.Delivered;
        emit JobDelivered(jobId, resultHash);
    }

    /// @notice Anyone can relay a verdict — the trust is in the signature, not the caller.
    function settle(uint256 jobId, bool pass, uint8 score, uint256 nonce, bytes calldata signature)
        external
        nonReentrant
    {
        Job storage job = jobs[jobId];
        if (job.status != Status.Delivered) revert NotDelivered();
        if (usedNonces[nonce]) revert NonceUsed();

        bytes32 structHash = keccak256(abi.encode(VERDICT_TYPEHASH, jobId, pass, score, nonce));
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        if (signer != verifier) revert BadSignature();

        usedNonces[nonce] = true;

        if (pass) {
            uint256 fee = (job.amountWei * feeBps) / 10_000;
            uint256 payout = job.amountWei - fee;
            balances[job.providerOwnerAtAccept] += payout;
            if (fee > 0 && feeRecipient != address(0)) balances[feeRecipient] += fee;
            job.status = Status.Settled;
        } else {
            balances[job.buyer] += job.amountWei;
            job.status = Status.Refunded;
        }

        emit JobSettled(jobId, pass, score);
        identity.setJobDelta(job.providerTokenId, false);
    }

    /// @notice Nobody accepted in time, or the provider accepted but never delivered.
    /// Only the buyer can trigger this, and only after the relevant deadline passed.
    function claimTimeout(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (msg.sender != job.buyer) revert NotBuyer();

        bool wasAccepted = (job.status == Status.Accepted);
        if (job.status == Status.Open) {
            // forge-lint: disable-next-line(block-timestamp)
            if (block.timestamp <= job.acceptDeadline) revert DeadlineNotPassed();
        } else if (wasAccepted) {
            // forge-lint: disable-next-line(block-timestamp)
            if (block.timestamp <= job.deliverDeadline) revert DeadlineNotPassed();
        } else {
            revert NotOpen();
        }

        balances[job.buyer] += job.amountWei;
        job.status = Status.Refunded;
        emit JobRefundedByTimeout(jobId);

        if (wasAccepted) {
            identity.setJobDelta(job.providerTokenId, false);
        }
    }

    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        balances[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _ownerOfAgent(uint256 tokenId) internal view returns (address) {
        return identity.ownerOf(tokenId);
    }

    /// @dev Exposed so a test or an off-chain signer can build the exact digest being
    /// checked, without duplicating the typehash/encoding by hand.
    function verdictDigest(uint256 jobId, bool pass, uint8 score, uint256 nonce)
        external
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(VERDICT_TYPEHASH, jobId, pass, score, nonce));
        return _hashTypedDataV4(structHash);
    }
}