// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AgentPolicyVault} from "../src/AgentPolicyVault.sol";
import {MockUSD8} from "../src/mocks/MockUSD8.sol";

contract AgentPolicyVaultTest is Test {
    MockUSD8 token;
    AgentPolicyVault vault;

    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address recipient = makeAddr("recipient");
    address otherRecipient = makeAddr("otherRecipient");
    address unauthorized = makeAddr("unauthorized");

    uint256 constant UNIT = 1e6;
    uint256 constant INITIAL_DEPOSIT = 100 * UNIT;
    uint256 constant MAX_PER_PAYMENT = 5 * UNIT;
    uint256 constant DAILY_LIMIT = 20 * UNIT;

    uint256 validUntil;

    function setUp() public {
        token = new MockUSD8();

        vm.prank(owner);
        vault = new AgentPolicyVault(IERC20(address(token)));

        token.mint(owner, 200 * UNIT);

        validUntil = block.timestamp + 7 days;

        vm.startPrank(owner);

        token.approve(address(vault), INITIAL_DEPOSIT);
        vault.deposit(INITIAL_DEPOSIT);

        vault.setAgentPolicy(agent, MAX_PER_PAYMENT, DAILY_LIMIT, validUntil);

        vault.setRecipientAllowed(recipient, true);

        vm.stopPrank();
    }

    // --------------------------------------------------
    // DEPOSIT TESTS
    // --------------------------------------------------

    function test_depositAndBalance() public view {
        assertEq(vault.getVaultBalance(), INITIAL_DEPOSIT);
        assertEq(token.balanceOf(address(vault)), INITIAL_DEPOSIT);
    }

    // --------------------------------------------------
    // PAYMENT TESTS
    // --------------------------------------------------

    function test_agentCanExecuteApprovedPayment() public {
        vm.prank(agent);
        vault.executePayment(recipient, 3 * UNIT);

        assertEq(token.balanceOf(recipient), 3 * UNIT);
        assertEq(vault.getVaultBalance(), 97 * UNIT);
        assertEq(vault.spentToday(), 3 * UNIT);
    }

    function test_unauthorizedAccountCannotExecutePayment() public {
        vm.expectRevert(AgentPolicyVault.Unauthorized.selector);
        vm.prank(unauthorized);
        vault.executePayment(recipient, UNIT);
    }

    function test_unapprovedRecipientCannotReceivePayment() public {
        vm.expectRevert(AgentPolicyVault.RecipientNotAllowed.selector);
        vm.prank(agent);
        vault.executePayment(otherRecipient, UNIT);
    }

    function test_paymentCannotExceedPerPaymentLimit() public {
        vm.expectRevert(AgentPolicyVault.PaymentLimitExceeded.selector);
        vm.prank(agent);
        vault.executePayment(recipient, MAX_PER_PAYMENT + 1);
    }

    function test_paymentCannotExceedDailyLimit() public {
        vm.startPrank(agent);

        vault.executePayment(recipient, MAX_PER_PAYMENT);
        vault.executePayment(recipient, MAX_PER_PAYMENT);
        vault.executePayment(recipient, MAX_PER_PAYMENT);
        vault.executePayment(recipient, MAX_PER_PAYMENT);

        vm.expectRevert(AgentPolicyVault.DailyLimitExceeded.selector);
        vault.executePayment(recipient, UNIT);

        vm.stopPrank();

        assertEq(vault.spentToday(), DAILY_LIMIT);
        assertEq(token.balanceOf(recipient), DAILY_LIMIT);
    }

    // --------------------------------------------------
    // AGENT PERMISSION TESTS
    // --------------------------------------------------

    function test_expiredAgentCannotExecutePayment() public {
        vm.warp(validUntil);

        vm.expectRevert(AgentPolicyVault.AgentExpired.selector);
        vm.prank(agent);
        vault.executePayment(recipient, UNIT);
    }

    function test_revokedAgentCannotExecutePayment() public {
        vm.prank(owner);
        vault.revokeAgent();

        vm.expectRevert(AgentPolicyVault.AgentNotActive.selector);
        vm.prank(agent);
        vault.executePayment(recipient, UNIT);
    }

    // --------------------------------------------------
    // WITHDRAWAL TESTS
    // --------------------------------------------------

    function test_ownerCanWithdraw() public {
        uint256 ownerBalanceBefore = token.balanceOf(owner);

        vm.prank(owner);
        vault.withdraw(10 * UNIT);

        assertEq(token.balanceOf(owner), ownerBalanceBefore + 10 * UNIT);
        assertEq(vault.getVaultBalance(), 90 * UNIT);
    }

    // --------------------------------------------------
    // DAILY ACCOUNTING TESTS
    // --------------------------------------------------

    function test_dailySpendingResetsOnNextUtcDay() public {
        vm.prank(agent);
        vault.executePayment(recipient, MAX_PER_PAYMENT);

        assertEq(vault.spentToday(), MAX_PER_PAYMENT);

        uint256 nextDay = ((block.timestamp / 1 days) + 1) * 1 days;
        vm.warp(nextDay);

        assertEq(vault.getRemainingDailyLimit(), DAILY_LIMIT);

        vm.prank(agent);
        vault.executePayment(recipient, MAX_PER_PAYMENT);

        assertEq(vault.spentToday(), MAX_PER_PAYMENT);
        assertEq(vault.getRemainingDailyLimit(), DAILY_LIMIT - MAX_PER_PAYMENT);
    }

    function test_nonOwnerCannotWithdraw() public {
        vm.expectRevert(AgentPolicyVault.Unauthorized.selector);
        vm.prank(unauthorized);
        vault.withdraw(UNIT);
    }

    function test_nonOwnerCannotChangeAgentPolicy() public {
        vm.expectRevert(AgentPolicyVault.Unauthorized.selector);
        vm.prank(unauthorized);
        vault.setAgentPolicy(unauthorized, MAX_PER_PAYMENT, DAILY_LIMIT, block.timestamp + 1 days);
    }

    function test_zeroAmountPaymentIsRejected() public {
        vm.expectRevert(AgentPolicyVault.ZeroAmount.selector);
        vm.prank(agent);
        vault.executePayment(recipient, 0);
    }

    function test_zeroAmountDepositIsRejected() public {
        vm.expectRevert(AgentPolicyVault.ZeroAmount.selector);
        vm.prank(owner);
        vault.deposit(0);
    }

    function test_disabledRecipientCannotReceivePayment() public {
        vm.prank(owner);
        vault.setRecipientAllowed(recipient, false);

        vm.expectRevert(AgentPolicyVault.RecipientNotAllowed.selector);
        vm.prank(agent);
        vault.executePayment(recipient, UNIT);
    }

    function test_agentCannotSpendWhenVaultIsEmpty() public {
        vm.prank(owner);
        vault.withdraw(INITIAL_DEPOSIT);

        vm.expectRevert(AgentPolicyVault.InsufficientVaultBalance.selector);
        vm.prank(agent);
        vault.executePayment(recipient, UNIT);
    }

    function test_invalidPolicyIsRejected() public {
        vm.expectRevert(AgentPolicyVault.InvalidPolicy.selector);
        vm.prank(owner);
        vault.setAgentPolicy(agent, 10 * UNIT, 5 * UNIT, block.timestamp + 1 days);
    }

    function test_constructorRejectsEOATokenAddress() public {
        vm.expectRevert(AgentPolicyVault.InvalidToken.selector);
        new AgentPolicyVault(IERC20(unauthorized));
    }

    function test_constructorRejectsZeroTokenAddress() public {
        vm.expectRevert(AgentPolicyVault.ZeroAddress.selector);
        new AgentPolicyVault(IERC20(address(0)));
    }

    function test_nonOwnerCannotDeposit() public {
        token.mint(unauthorized, 10 * UNIT);

        vm.expectRevert(AgentPolicyVault.Unauthorized.selector);
        vm.prank(unauthorized);
        vault.deposit(10 * UNIT);
    }

    function test_policyUpdateDoesNotResetDailySpending() public {
        vm.prank(agent);
        vault.executePayment(recipient, 4 * UNIT);

        uint256 updatedValidUntil = block.timestamp + 14 days;

        vm.prank(owner);
        vault.setAgentPolicy(agent, MAX_PER_PAYMENT, DAILY_LIMIT, updatedValidUntil);

        assertEq(vault.spentToday(), 4 * UNIT);
        assertEq(vault.getRemainingDailyLimit(), DAILY_LIMIT - 4 * UNIT);
    }

    function test_loweringDailyLimitBelowSpentAmountBlocksPayments() public {
        vm.startPrank(agent);
        vault.executePayment(recipient, 5 * UNIT);
        vault.executePayment(recipient, 5 * UNIT);
        vault.executePayment(recipient, 5 * UNIT);
        vm.stopPrank();

        vm.prank(owner);
        vault.setAgentPolicy(agent, MAX_PER_PAYMENT, 10 * UNIT, block.timestamp + 14 days);

        assertEq(vault.spentToday(), 15 * UNIT);

        vm.expectRevert(AgentPolicyVault.DailyLimitExceeded.selector);
        vm.prank(agent);
        vault.executePayment(recipient, UNIT);
    }

    function test_ownerCannotWithdrawMoreThanVaultBalance() public {
        vm.expectRevert();
        vm.prank(owner);
        vault.withdraw(INITIAL_DEPOSIT + 1);

        assertEq(vault.getVaultBalance(), INITIAL_DEPOSIT);
    }

    function test_failedWithdrawalDoesNotChangeDailySpending() public {
        vm.prank(agent);
        vault.executePayment(recipient, 3 * UNIT);

        uint256 spentBefore = vault.spentToday();

        vm.expectRevert();
        vm.prank(owner);
        vault.withdraw(INITIAL_DEPOSIT);

        assertEq(vault.spentToday(), spentBefore);
        assertEq(vault.getVaultBalance(), INITIAL_DEPOSIT - 3 * UNIT);
    }

    function test_replacingAgentRevokesOldAgentAndPreservesSpending() public {
        vm.prank(agent);
        vault.executePayment(recipient, 3 * UNIT);

        address newAgent = makeAddr("newAgent");

        vm.prank(owner);
        vault.setAgentPolicy(newAgent, MAX_PER_PAYMENT, DAILY_LIMIT, block.timestamp + 14 days);

        assertEq(vault.agent(), newAgent);
        assertEq(vault.spentToday(), 3 * UNIT);

        vm.expectRevert(AgentPolicyVault.Unauthorized.selector);
        vm.prank(agent);
        vault.executePayment(recipient, UNIT);

        vm.prank(newAgent);
        vault.executePayment(recipient, UNIT);

        assertEq(vault.spentToday(), 4 * UNIT);
    }

    function test_zeroAddressCannotBeSetAsAgent() public {
        vm.expectRevert(AgentPolicyVault.ZeroAddress.selector);
        vm.prank(owner);
        vault.setAgentPolicy(address(0), MAX_PER_PAYMENT, DAILY_LIMIT, block.timestamp + 1 days);
    }
}
