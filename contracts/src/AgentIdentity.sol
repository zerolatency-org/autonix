// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice An agent's on-chain identity ("Agentic ID"). Plain ERC-721 transfers are
/// blocked: the only way a token moves is through `AgentIdentity.transferViaOracle`
/// wiring that a later phase can add, or a future owner-signed flow. For Phase 1,
/// transfer is disabled outright and only mint/retire change ownership.
///
/// Design choices, and why:
/// - `operator` is a second address (the agent's own working wallet) that can act
///   on the agent's behalf up to a spending cap, WITHOUT being able to move the
///   token itself. ERC-721 `approve`/`setApprovalForAll` never grant operator
///   rights here — those are a completely separate mapping.
/// - `activeJobs` is incremented/decremented by `JobEscrow` only. While an agent
///   has an open job, it cannot be retired or have its operator rotated out from
///   under a live job.
contract AgentIdentity is ERC721, Ownable {
    struct Agent {
        address operator;
        uint256 operatorCapWei;
        string profileURI;
        uint32 activeJobs;
        bool retired;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => Agent) private _agents;
    address public escrow;

    event AgentMinted(uint256 indexed tokenId, address indexed owner, string profileURI);
    event OperatorSet(uint256 indexed tokenId, address operator, uint256 capWei);
    event ProfileUpdated(uint256 indexed tokenId, string profileURI);
    event AgentRetired(uint256 indexed tokenId);
    event EscrowSet(address escrow);

    error NotTokenOwner();
    error AlreadyRetired();
    error HasActiveJobs();
    error TransfersDisabled();
    error OnlyEscrow();
    error ZeroAddress();

    modifier onlyAgentOwner(uint256 tokenId) {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        _;
    }

    constructor(address initialOwner) ERC721("Autonix Agentic ID", "AGENT") Ownable(initialOwner) {}

    /// @notice One-time wiring so JobEscrow can mark jobs active/closed. Owner-only,
    /// meant to be called once at deploy time (see ADR in the Phase 1 build guide).
    function setEscrow(address escrowAddress) external onlyOwner {
        if (escrowAddress == address(0)) revert ZeroAddress();
        escrow = escrowAddress;
        emit EscrowSet(escrowAddress);
    }

    function mint(address to, string calldata profileURI) external returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        tokenId = _nextId++;
        _agents[tokenId] = Agent({
            operator: address(0),
            operatorCapWei: 0,
            profileURI: profileURI,
            activeJobs: 0,
            retired: false
        });
        emit AgentMinted(tokenId, to, profileURI);
        _safeMint(to, tokenId);
    }

    function setOperator(uint256 tokenId, address operator, uint256 capWei)
        external
        onlyAgentOwner(tokenId)
    {
        if (_agents[tokenId].retired) revert AlreadyRetired();
        _agents[tokenId].operator = operator;
        _agents[tokenId].operatorCapWei = capWei;
        emit OperatorSet(tokenId, operator, capWei);
    }

    function updateProfile(uint256 tokenId, string calldata profileURI)
        external
        onlyAgentOwner(tokenId)
    {
        if (_agents[tokenId].retired) revert AlreadyRetired();
        _agents[tokenId].profileURI = profileURI;
        emit ProfileUpdated(tokenId, profileURI);
    }

    function retire(uint256 tokenId) external onlyAgentOwner(tokenId) {
        Agent storage a = _agents[tokenId];
        if (a.retired) revert AlreadyRetired();
        if (a.activeJobs > 0) revert HasActiveJobs();
        a.retired = true;
        a.operator = address(0);
        a.operatorCapWei = 0;
        emit AgentRetired(tokenId);
    }

    /// @notice Called by JobEscrow only, when a job opens or closes for this agent.
    function setJobDelta(uint256 tokenId, bool increment) external {
        if (msg.sender != escrow) revert OnlyEscrow();
        Agent storage a = _agents[tokenId];
        if (increment) {
            a.activeJobs += 1;
        } else {
            // never underflow even if called out of order
            if (a.activeJobs > 0) a.activeJobs -= 1;
        }
    }

    function agentOf(uint256 tokenId)
        external
        view
        returns (address operator, uint256 operatorCapWei, string memory profileURI, uint32 activeJobs, bool retired)
    {
        Agent storage a = _agents[tokenId];
        return (a.operator, a.operatorCapWei, a.profileURI, a.activeJobs, a.retired);
    }

    function isRetired(uint256 tokenId) external view returns (bool) {
        return _agents[tokenId].retired;
    }

    function activeJobsOf(uint256 tokenId) external view returns (uint32) {
        return _agents[tokenId].activeJobs;
    }

    /// @dev This is the whole point of the contract: every transfer path in OpenZeppelin
    /// v5 ERC-721 (mint, burn, transferFrom, safeTransferFrom) routes through `_update`.
    /// Minting and burning still work (from == 0 or to == 0); any other transfer reverts.
    /// A real "sell this agent" flow is added in a later phase behind an explicit,
    /// audited function — never through the standard ERC-721 path.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        bool isMintOrBurn = (from == address(0) || to == address(0));
        if (!isMintOrBurn) revert TransfersDisabled();
        return super._update(to, tokenId, auth);
    }
}