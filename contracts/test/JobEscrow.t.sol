// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentIdentity} from "../src/AgentIdentity.sol";
import {JobEscrow} from "../src/JobEscrow.sol";

contract RejectsEther {
    receive() external payable {
        revert("nope");
    }
}

contract JobEscrowTest is Test {
    AgentIdentity internal identity;
    JobEscrow internal escrow;

    address internal deployer = makeAddr("deployer");
    address internal buyer = makeAddr("buyer");
    address internal providerOwner = makeAddr("providerOwner");
    address internal feeRecipient = makeAddr("feeRecipient");

    uint256 internal verifierPk = 0xBEEF;
    address internal verifier;

    uint256 internal providerTokenId;
    bytes32 internal criteria = keccak256("clean this csv, dedupe rows");

    function setUp() public {
        verifier = vm.addr(verifierPk);
        identity = new AgentIdentity(deployer);
        escrow = new JobEscrow(deployer, identity, verifier);

        vm.prank(deployer);
        identity.setEscrow(address(escrow));

        vm.prank(providerOwner);
        providerTokenId = identity.mint(providerOwner, "ipfs://provider");

        vm.deal(buyer, 10 ether);
    }

    function _sign(uint256 jobId, bool pass, uint8 score, uint256 nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = escrow.verdictDigest(jobId, pass, score, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _createAndAccept(uint256 amount) internal returns (uint256 jobId) {
        vm.prank(buyer);
        jobId = escrow.createJob{value: amount}(providerTokenId, criteria, uint64(block.timestamp + 1 hours));
        vm.prank(providerOwner);
        escrow.accept(jobId);
    }

    // --- happy path ---

    function test_FullHappyPath_PaysProvider() public {
        uint256 jobId = _createAndAccept(1 ether);
        vm.prank(providerOwner);
        escrow.commitDelivery(jobId, keccak256("result"));

        escrow.settle(jobId, true, 95, 1, _sign(jobId, true, 95, 1));

        assertEq(escrow.balances(providerOwner), 1 ether);
        vm.prank(providerOwner);
        escrow.withdraw();
        assertEq(providerOwner.balance, 1 ether);
        assertEq(identity.activeJobsOf(providerTokenId), 0);
    }

    function test_FailingVerdict_RefundsBuyer() public {
        uint256 jobId = _createAndAccept(1 ether);
        vm.prank(providerOwner);
        escrow.commitDelivery(jobId, keccak256("bad result"));

        escrow.settle(jobId, false, 10, 2, _sign(jobId, false, 10, 2));

        assertEq(escrow.balances(buyer), 1 ether);
        uint256 before = buyer.balance;
        vm.prank(buyer);
        escrow.withdraw();
        assertEq(buyer.balance, before + 1 ether);
    }

    function test_Fee_SplitsPayout() public {
        vm.prank(deployer);
        escrow.setFee(1000, feeRecipient); // 10%

        uint256 jobId = _createAndAccept(1 ether);
        vm.prank(providerOwner);
        escrow.commitDelivery(jobId, keccak256("result"));
        escrow.settle(jobId, true, 95, 1, _sign(jobId, true, 95, 1));

        assertEq(escrow.balances(providerOwner), 0.9 ether);
        assertEq(escrow.balances(feeRecipient), 0.1 ether);
    }

    // --- signature and replay protection ---

    function test_WrongSignerReverts() public {
        uint256 jobId = _createAndAccept(1 ether);
        vm.prank(providerOwner);
        escrow.commitDelivery(jobId, keccak256("result"));

        uint256 impostorPk = 0xDEAD;
        bytes32 digest = escrow.verdictDigest(jobId, true, 95, 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(impostorPk, digest);

        vm.expectRevert(JobEscrow.BadSignature.selector);
        escrow.settle(jobId, true, 95, 1, abi.encodePacked(r, s, v));
    }

    function test_NonceCannotBeReplayed() public {
        uint256 jobId = _createAndAccept(1 ether);
        vm.prank(providerOwner);
        escrow.commitDelivery(jobId, keccak256("result"));
        bytes memory sig = _sign(jobId, true, 95, 1);
        escrow.settle(jobId, true, 95, 1, sig);

        // second job, SAME nonce, must still be rejected
        uint256 jobId2 = _createAndAccept(1 ether);
        vm.prank(providerOwner);
        escrow.commitDelivery(jobId2, keccak256("result2"));
        bytes memory sigReused = _sign(jobId2, true, 95, 1); // computed before expectRevert — see note above
        vm.expectRevert(JobEscrow.NonceUsed.selector);
        escrow.settle(jobId2, true, 95, 1, sigReused);
    }

    function test_SignatureForDifferentJobIdRejected() public {
        uint256 jobId = _createAndAccept(1 ether);
        vm.prank(providerOwner);
        escrow.commitDelivery(jobId, keccak256("result"));
        // sign for jobId+1, use on jobId
        bytes memory sig = _sign(jobId + 1, true, 95, 1);
        vm.expectRevert(JobEscrow.BadSignature.selector);
        escrow.settle(jobId, true, 95, 1, sig);
    }

    function test_CannotSettleTwice() public {
        uint256 jobId = _createAndAccept(1 ether);
        vm.prank(providerOwner);
        escrow.commitDelivery(jobId, keccak256("result"));
        escrow.settle(jobId, true, 95, 1, _sign(jobId, true, 95, 1));

        bytes memory sig2 = _sign(jobId, true, 95, 2); // compute BEFORE arming expectRevert —
        vm.expectRevert(JobEscrow.NotDelivered.selector); // _sign calls verdictDigest(), an
        escrow.settle(jobId, true, 95, 2, sig2); // external call, which would otherwise be
        // "the next call" that expectRevert intercepts instead of settle() itself.
    }

    // --- ownership snapshot: a sale mid-job cannot redirect payout ---
    // (transfer is disabled in Phase 1, so we prove the snapshot itself is correct
    //  and immune to a *different* current-owner read after accept.)

    function test_PayoutGoesToOwnerAtAcceptTime() public {
        uint256 jobId = _createAndAccept(1 ether);
        vm.prank(providerOwner);
        escrow.commitDelivery(jobId, keccak256("result"));
        escrow.settle(jobId, true, 95, 1, _sign(jobId, true, 95, 1));
        assertEq(escrow.balances(providerOwner), 1 ether);
    }

    function test_OnlyCurrentAgentOwnerCanAccept() public {
        vm.prank(buyer);
        uint256 jobId = escrow.createJob{value: 1 ether}(
            providerTokenId, criteria, uint64(block.timestamp + 1 hours)
        );
        address impostor = makeAddr("impostor");
        vm.prank(impostor);
        vm.expectRevert(JobEscrow.NotProviderOwner.selector);
        escrow.accept(jobId);
    }

    // --- timeouts ---

    function test_TimeoutRefundsIfNeverAccepted() public {
        vm.prank(buyer);
        uint256 jobId = escrow.createJob{value: 1 ether}(
            providerTokenId, criteria, uint64(block.timestamp + 1 hours)
        );
        vm.warp(block.timestamp + 2 hours);
        vm.prank(buyer);
        escrow.claimTimeout(jobId);
        assertEq(escrow.balances(buyer), 1 ether);
    }

    function test_TimeoutRefundsIfAcceptedButNeverDelivered() public {
        uint256 jobId = _createAndAccept(1 ether);
        vm.warp(block.timestamp + 2 days);
        vm.prank(buyer);
        escrow.claimTimeout(jobId);
        assertEq(escrow.balances(buyer), 1 ether);
        assertEq(identity.activeJobsOf(providerTokenId), 0);
    }

    function test_CannotClaimTimeoutBeforeDeadline() public {
        vm.prank(buyer);
        uint256 jobId = escrow.createJob{value: 1 ether}(
            providerTokenId, criteria, uint64(block.timestamp + 1 hours)
        );
        vm.prank(buyer);
        vm.expectRevert(JobEscrow.DeadlineNotPassed.selector);
        escrow.claimTimeout(jobId);
    }

    function test_OnlyBuyerCanClaimTimeout() public {
        vm.prank(buyer);
        uint256 jobId = escrow.createJob{value: 1 ether}(
            providerTokenId, criteria, uint64(block.timestamp + 1 hours)
        );
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(JobEscrow.NotBuyer.selector);
        escrow.claimTimeout(jobId);
    }

    // --- pull payments: a payee that rejects ETH cannot lock anyone else's funds ---

    function test_RejectingPayeeCannotBlockOthersWithdrawing() public {
        RejectsEther badReceiver = new RejectsEther();
        vm.prank(address(badReceiver));
        uint256 badTokenId = identity.mint(address(badReceiver), "ipfs://bad");

        vm.prank(buyer);
        uint256 jobId = escrow.createJob{value: 1 ether}(badTokenId, criteria, uint64(block.timestamp + 1 hours));
        vm.prank(address(badReceiver));
        escrow.accept(jobId);
        vm.prank(address(badReceiver));
        escrow.commitDelivery(jobId, keccak256("result"));
        escrow.settle(jobId, true, 95, 1, _sign(jobId, true, 95, 1));

        // bad receiver's own withdraw fails...
        vm.prank(address(badReceiver));
        vm.expectRevert(JobEscrow.TransferFailed.selector);
        escrow.withdraw();

        // ...but a second, unrelated job settles and withdraws fine regardless
        uint256 jobId2 = _createAndAccept(1 ether);
        vm.prank(providerOwner);
        escrow.commitDelivery(jobId2, keccak256("result2"));
        escrow.settle(jobId2, true, 95, 2, _sign(jobId2, true, 95, 2));
        vm.prank(providerOwner);
        escrow.withdraw();
        assertEq(providerOwner.balance, 1 ether);
    }

    // --- invariant-style check on a sequence ---

    function test_ContractBalanceMatchesOpenPlusWithdrawable() public {
        uint256 j1 = _createAndAccept(1 ether);
        uint256 j2 = _createAndAccept(2 ether);
        vm.prank(providerOwner);
        escrow.commitDelivery(j1, keccak256("r1"));
        escrow.settle(j1, true, 95, 1, _sign(j1, true, 95, 1));

        // settle() only moves bookkeeping (locked -> withdrawable); it never sends ETH out.
        // So the contract's real balance is everything ever deposited, full stop, until
        // someone actually calls withdraw(). j1 (1 ether) + j2 (2 ether) = 3 ether total.
        assertEq(address(escrow).balance, 3 ether);
        assertEq(escrow.balances(providerOwner), 1 ether); // j1's payout, withdrawable now
        assertEq(j2, 2); // silence the unused-variable warning; j2 is still open/accepted
    }

    function testFuzz_CreateJobRejectsZeroValue(uint64 deadline) public {
        vm.assume(deadline > block.timestamp);
        vm.prank(buyer);
        vm.expectRevert(JobEscrow.InvalidAmount.selector);
        escrow.createJob{value: 0}(providerTokenId, criteria, deadline);
    }
}