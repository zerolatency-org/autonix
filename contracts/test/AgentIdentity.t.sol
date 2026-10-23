// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {AgentIdentity} from "../src/AgentIdentity.sol";

contract AgentIdentityTest is Test {
    AgentIdentity internal identity;
    address internal deployer = makeAddr("deployer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal escrow = makeAddr("escrow");

    function setUp() public {
        identity = new AgentIdentity(deployer);
        vm.prank(deployer);
        identity.setEscrow(escrow);
    }

    function _mint(address to) internal returns (uint256) {
        vm.prank(to);
        return identity.mint(to, "ipfs://profile");
    }

    // --- minting and ownership ---

    function test_MintSetsOwnerAndProfile() public {
        uint256 id = _mint(alice);
        assertEq(identity.ownerOf(id), alice);
        (, , string memory uri, uint32 jobs, bool retired) = identity.agentOf(id);
        assertEq(uri, "ipfs://profile");
        assertEq(jobs, 0);
        assertFalse(retired);
    }

    function test_AnyoneCanMintForThemselves() public {
        uint256 id = _mint(bob);
        assertEq(identity.ownerOf(id), bob);
    }

    // --- transfers blocked (the whole point of the contract) ---

    function test_TransferFromReverts() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(AgentIdentity.TransfersDisabled.selector);
        identity.transferFrom(alice, bob, id);
    }

    function test_SafeTransferFromReverts() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(AgentIdentity.TransfersDisabled.selector);
        identity.safeTransferFrom(alice, bob, id);
    }

    function test_ApprovalCannotMoveToken() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        identity.approve(bob, id);
        vm.prank(bob);
        vm.expectRevert(AgentIdentity.TransfersDisabled.selector);
        identity.transferFrom(alice, bob, id);
    }

    function test_ApprovalForAllCannotMoveToken() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        identity.setApprovalForAll(bob, true);
        vm.prank(bob);
        vm.expectRevert(AgentIdentity.TransfersDisabled.selector);
        identity.transferFrom(alice, bob, id);
    }

    // --- operator is separate from transfer rights ---

    function test_ApprovalDoesNotGrantOperatorRights() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        identity.approve(bob, id);
        (address operator, , , , ) = identity.agentOf(id);
        assertEq(operator, address(0));
    }

    function test_OnlyOwnerCanSetOperator() public {
        uint256 id = _mint(alice);
        vm.prank(bob);
        vm.expectRevert(AgentIdentity.NotTokenOwner.selector);
        identity.setOperator(id, bob, 1 ether);
    }

    function test_OwnerCanSetOperator() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        identity.setOperator(id, bob, 1 ether);
        (address operator, uint256 cap, , , ) = identity.agentOf(id);
        assertEq(operator, bob);
        assertEq(cap, 1 ether);
    }

    // --- job-count gating (set only by escrow) ---

    function test_OnlyEscrowCanChangeJobCount() public {
        uint256 id = _mint(alice);
        vm.expectRevert(AgentIdentity.OnlyEscrow.selector);
        identity.setJobDelta(id, true);
    }

    function test_EscrowCanIncrementAndDecrement() public {
        uint256 id = _mint(alice);
        vm.startPrank(escrow);
        identity.setJobDelta(id, true);
        assertEq(identity.activeJobsOf(id), 1);
        identity.setJobDelta(id, false);
        assertEq(identity.activeJobsOf(id), 0);
        vm.stopPrank();
    }

    function test_JobCountNeverUnderflows() public {
        uint256 id = _mint(alice);
        vm.prank(escrow);
        identity.setJobDelta(id, false); // decrement from 0
        assertEq(identity.activeJobsOf(id), 0);
    }

    // --- retire ---

    function test_RetireBlockedWhileJobsActive() public {
        uint256 id = _mint(alice);
        vm.prank(escrow);
        identity.setJobDelta(id, true);
        vm.prank(alice);
        vm.expectRevert(AgentIdentity.HasActiveJobs.selector);
        identity.retire(id);
    }

    function test_RetireSucceedsWithNoActiveJobs() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        identity.retire(id);
        assertTrue(identity.isRetired(id));
    }

    function test_CannotRetireTwice() public {
        uint256 id = _mint(alice);
        vm.startPrank(alice);
        identity.retire(id);
        vm.expectRevert(AgentIdentity.AlreadyRetired.selector);
        identity.retire(id);
        vm.stopPrank();
    }

    function testFuzz_NonOwnerCannotRetire(address caller) public {
        uint256 id = _mint(alice);
        vm.assume(caller != alice);
        vm.prank(caller);
        vm.expectRevert(AgentIdentity.NotTokenOwner.selector);
        identity.retire(id);
    }
}