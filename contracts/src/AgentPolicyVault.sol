// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentPolicyVault
/// @notice A stablecoin vault that allows an authorized AI agent
///         to execute payments under owner-defined spending policies.
contract AgentPolicyVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --------------------------------------------------
    // STATE VARIABLES
    // --------------------------------------------------

    address public immutable owner;
    IERC20 public immutable token;

    address public agent;
    bool public agentActive;

    uint256 public maxPerPayment;
    uint256 public dailyLimit;
    uint256 public validUntil;

    uint256 public spentToday;
    uint256 public lastSpendDay;

    mapping(address recipient => bool allowed) public allowedRecipients;

    // --------------------------------------------------
    // EVENTS
    // --------------------------------------------------

    event Deposited(address indexed depositor, uint256 amount);

    event Withdrawn(address indexed owner, uint256 amount);

    event AgentPolicyUpdated(
        address indexed agent, uint256 maxPerPayment, uint256 dailyLimit, uint256 validUntil
    );

    event AgentRevoked(address indexed agent);

    event RecipientPermissionUpdated(address indexed recipient, bool allowed);

    event PaymentExecuted(address indexed agent, address indexed recipient, uint256 amount, uint256 day);

    // --------------------------------------------------
    // ERRORS
    // --------------------------------------------------

    error InvalidToken();
    error Unauthorized();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidPolicy();
    error AgentNotActive();
    error AgentExpired();
    error RecipientNotAllowed();
    error PaymentLimitExceeded();
    error DailyLimitExceeded();
    error InsufficientVaultBalance();

    // --------------------------------------------------
    // MODIFIERS
    // --------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert Unauthorized();
        _;
    }

    // --------------------------------------------------
    // CONSTRUCTOR
    // --------------------------------------------------

    constructor(IERC20 token_) {
        if (address(token_) == address(0)) revert ZeroAddress();
        if (address(token_).code.length == 0) revert InvalidToken();

        owner = msg.sender;
        token = token_;
    }

    // --------------------------------------------------
    // DEPOSIT
    // --------------------------------------------------

    /// @notice Deposit tUSD8 into the vault.
    /// @dev Depositor must approve this contract first.
    function deposit(uint256 amount) external nonReentrant onlyOwner {
        if (amount == 0) revert ZeroAmount();

        token.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, amount);
    }

    // --------------------------------------------------
    // AGENT POLICY
    // --------------------------------------------------

    /// @notice Authorize an agent and configure its spending limits.
    /// @dev Updating policy does not reset existing daily spending.
    function setAgentPolicy(address agent_, uint256 maxPerPayment_, uint256 dailyLimit_, uint256 validUntil_)
        external
        onlyOwner
    {
        if (agent_ == address(0)) revert ZeroAddress();

        if (
            maxPerPayment_ == 0 || dailyLimit_ == 0 || maxPerPayment_ > dailyLimit_
                || validUntil_ <= block.timestamp
        ) {
            revert InvalidPolicy();
        }

        agent = agent_;
        maxPerPayment = maxPerPayment_;
        dailyLimit = dailyLimit_;
        validUntil = validUntil_;
        agentActive = true;

        emit AgentPolicyUpdated(agent_, maxPerPayment_, dailyLimit_, validUntil_);
    }

    /// @notice Immediately revoke the current agent's permission.
    function revokeAgent() external onlyOwner {
        agentActive = false;

        emit AgentRevoked(agent);
    }

    // --------------------------------------------------
    // RECIPIENT MANAGEMENT
    // --------------------------------------------------

    /// @notice Add or remove a payment recipient.
    function setRecipientAllowed(address recipient, bool allowed) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();

        allowedRecipients[recipient] = allowed;

        emit RecipientPermissionUpdated(recipient, allowed);
    }

    // --------------------------------------------------
    // PAYMENT EXECUTION
    // --------------------------------------------------

    /// @notice Execute a payment using the authorized agent.
    /// @dev All spending restrictions are enforced on-chain.
    function executePayment(address recipient, uint256 amount) external nonReentrant onlyAgent {
        if (!agentActive) revert AgentNotActive();

        if (block.timestamp >= validUntil) revert AgentExpired();

        if (recipient == address(0)) revert ZeroAddress();

        if (amount == 0) revert ZeroAmount();

        if (!allowedRecipients[recipient]) {
            revert RecipientNotAllowed();
        }

        if (amount > maxPerPayment) {
            revert PaymentLimitExceeded();
        }

        uint256 currentDay = block.timestamp / 1 days;

        // Reset daily spending when a new UTC day begins.
        if (lastSpendDay != currentDay) {
            spentToday = 0;
            lastSpendDay = currentDay;
        }

        if (spentToday > dailyLimit || amount > dailyLimit - spentToday) {
            revert DailyLimitExceeded();
        }

        if (token.balanceOf(address(this)) < amount) {
            revert InsufficientVaultBalance();
        }

        // Update accounting before transferring tokens.
        spentToday += amount;

        token.safeTransfer(recipient, amount);

        emit PaymentExecuted(msg.sender, recipient, amount, currentDay);
    }

    // --------------------------------------------------
    // WITHDRAWAL
    // --------------------------------------------------

    /// @notice Allow the owner to withdraw vault funds.
    function withdraw(uint256 amount) external nonReentrant onlyOwner {
        if (amount == 0) revert ZeroAmount();

        token.safeTransfer(owner, amount);

        emit Withdrawn(owner, amount);
    }

    // --------------------------------------------------
    // VIEW FUNCTIONS
    // --------------------------------------------------

    /// @notice Return the remaining daily spending allowance.
    function getRemainingDailyLimit() external view returns (uint256) {
        uint256 currentDay = block.timestamp / 1 days;

        if (lastSpendDay != currentDay) {
            return dailyLimit;
        }

        if (spentToday >= dailyLimit) {
            return 0;
        }

        return dailyLimit - spentToday;
    }

    /// @notice Return the current vault token balance.
    function getVaultBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
