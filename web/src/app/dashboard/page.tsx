"use client";

import { formatUnits, isAddress, parseUnits, zeroAddress, type Hash } from "viem";
import { useAccount, useConfig, useReadContract } from "wagmi";
import { useNetwork } from "@/lib/network";
import { useToken } from "@/components/useToken";
import { agentPolicyVaultAbi } from "@/lib/abi/agentPolicyVault";
import { erc20Abi } from "@aevum-kit/aevum";
import { readContract, simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { useState } from "react";
import { explain } from "@/lib/errors";

function shortAddress(value?: string) {
  if (!value) return "Not configured";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatAmount(value: bigint | undefined, decimals: number, symbol: string) {
  if (value === undefined) return "—";
  return `${Number(formatUnits(value, decimals)).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })} ${symbol}`;
}

function formatExpiry(value: bigint | undefined) {
  if (value === undefined) return "—";
  if (value === 0n) return "Not configured";

  return new Date(Number(value) * 1000).toLocaleString();
}

export default function DashboardPage() {
  const { net } = useNetwork();
  const { address, isConnected, chainId } = useAccount();
  const config = useConfig();
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPhase, setDepositPhase] = useState<"idle" | "approving" | "depositing" | "success" | "error">("idle");
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositHash, setDepositHash] = useState<Hash | null>(null);

  const [agentInput, setAgentInput] = useState("");
  const [maxPerPaymentInput, setMaxPerPaymentInput] = useState("");
  const [dailyLimitInput, setDailyLimitInput] = useState("");
  const [validUntilInput, setValidUntilInput] = useState("");
  const [policyPhase, setPolicyPhase] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policyHash, setPolicyHash] = useState<Hash | null>(null);

  const [recipientInput, setRecipientInput] = useState("");
  const [recipientAllowedInput, setRecipientAllowedInput] = useState(true);
  const [recipientPhase, setRecipientPhase] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [recipientHash, setRecipientHash] = useState<Hash | null>(null);

  const [revokePhase, setRevokePhase] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeHash, setRevokeHash] = useState<Hash | null>(null);

  const [paymentRecipient, setPaymentRecipient] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentPhase, setPaymentPhase] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<Hash | null>(null);

  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiApplyStatus, setAiApplyStatus] = useState("");
  const [aiApproval, setAiApproval] = useState<
    "pending" | "approved" | "rejected" | null
  >(null);
  const [aiResult, setAiResult] = useState<{
    proposal: {
      intent: "payment" | "not_payment" | "unclear";
      recipientAddress: string | null;
      amount: string | null;
      tokenSymbol: "tUSD8" | "unknown";
      purpose: string;
      missingInformation: string[];
      summary: string;
    };
    readyForReview: boolean;
    requiresHumanApproval: boolean;
    transactionSubmitted: boolean;
    provider: string;
  } | null>(null);

  const token = useToken();

  const vaultAddress = net.vault;
  const appChain = net.chain;
  const onChain = isConnected && chainId === appChain.id;
  const canRead = onChain && Boolean(vaultAddress);
  const tokenAddress = token.address ?? zeroAddress;

  const tokenBalance = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: appChain.id,
    query: { enabled: canRead && Boolean(token.address && address) },
  });

  const tokenAllowance = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && vaultAddress ? [address, vaultAddress] : undefined,
    chainId: appChain.id,
    query: { enabled: canRead && Boolean(token.address && address) },
  });

  const owner = useReadContract({
    address: vaultAddress,
    abi: agentPolicyVaultAbi,
    functionName: "owner",
    chainId: appChain.id,
    query: { enabled: canRead },
  });

  const isVaultOwner = Boolean(
    address && owner.data && address.toLowerCase() === owner.data.toLowerCase()
  );

  const agent = useReadContract({
    address: vaultAddress,
    abi: agentPolicyVaultAbi,
    functionName: "agent",
    chainId: appChain.id,
    query: { enabled: canRead },
  });

  const agentActive = useReadContract({
    address: vaultAddress,
    abi: agentPolicyVaultAbi,
    functionName: "agentActive",
    chainId: appChain.id,
    query: { enabled: canRead },
  });

  const maxPerPayment = useReadContract({
    address: vaultAddress,
    abi: agentPolicyVaultAbi,
    functionName: "maxPerPayment",
    chainId: appChain.id,
    query: { enabled: canRead },
  });

  const dailyLimit = useReadContract({
    address: vaultAddress,
    abi: agentPolicyVaultAbi,
    functionName: "dailyLimit",
    chainId: appChain.id,
    query: { enabled: canRead },
  });

  const spentToday = useReadContract({
    address: vaultAddress,
    abi: agentPolicyVaultAbi,
    functionName: "spentToday",
    chainId: appChain.id,
    query: { enabled: canRead },
  });

  const remainingLimit = useReadContract({
    address: vaultAddress,
    abi: agentPolicyVaultAbi,
    functionName: "getRemainingDailyLimit",
    chainId: appChain.id,
    query: { enabled: canRead },
  });

  const vaultBalance = useReadContract({
    address: vaultAddress,
    abi: agentPolicyVaultAbi,
    functionName: "getVaultBalance",
    chainId: appChain.id,
    query: { enabled: canRead },
  });

  const validUntil = useReadContract({
    address: vaultAddress,
    abi: agentPolicyVaultAbi,
    functionName: "validUntil",
    chainId: appChain.id,
    query: { enabled: canRead },
  });

  const recipientAllowed = useReadContract({
    address: vaultAddress,
    abi: agentPolicyVaultAbi,
    functionName: "allowedRecipients",
    args: isAddress(recipientInput.trim())
      ? [recipientInput.trim() as `0x${string}`]
      : undefined,
    chainId: appChain.id,
    query: {
      enabled: canRead && isAddress(recipientInput.trim()),
    },
  });

  const paymentRecipientAllowed = useReadContract({
    address: vaultAddress,
    abi: agentPolicyVaultAbi,
    functionName: "allowedRecipients",
    args: isAddress(paymentRecipient.trim())
      ? [paymentRecipient.trim() as `0x${string}`]
      : undefined,
    chainId: appChain.id,
    query: {
      enabled: canRead && isAddress(paymentRecipient.trim()),
    },
  });

  async function handleDeposit() {
    if (!address || !vaultAddress || !token.address || !isVaultOwner) {
      setDepositError("Connect the vault owner wallet on the selected network.");
      setDepositPhase("error");
      return;
    }

    if (!/^\d+(\.\d+)?$/.test(depositAmount.trim())) {
      setDepositError("Enter a valid positive deposit amount.");
      setDepositPhase("error");
      return;
    }

    let amount: bigint;

    try {
      amount = parseUnits(depositAmount.trim(), decimals);
      if (amount <= 0n) throw new Error("Deposit amount must be greater than zero.");
    } catch (error) {
      setDepositError(error instanceof Error ? error.message : "Invalid deposit amount.");
      setDepositPhase("error");
      return;
    }

    setDepositError(null);
    setDepositHash(null);
    setDepositPhase("approving");

    try {
      const currentBalance = await readContract(config, {
        address: token.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
        chainId: appChain.id,
      });

      if (currentBalance < amount) {
        throw new Error("Insufficient tUSD8 balance in your wallet.");
      }

      const currentAllowance = await readContract(config, {
        address: token.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, vaultAddress],
        chainId: appChain.id,
      });

      if (currentAllowance < amount) {
        const approval = await simulateContract(config, {
          account: address,
          address: token.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [vaultAddress, amount],
          chainId: appChain.id,
        });

        const approvalHash = await writeContract(config, approval.request);
        const approvalReceipt = await waitForTransactionReceipt(config, {
          hash: approvalHash,
          chainId: appChain.id,
        });

        if (approvalReceipt.status !== "success") {
          throw new Error("Token approval failed. The deposit was not submitted.");
        }
      }

      setDepositPhase("depositing");

      const simulation = await simulateContract(config, {
        account: address,
        address: vaultAddress,
        abi: agentPolicyVaultAbi,
        functionName: "deposit",
        args: [amount],
        chainId: appChain.id,
      });

      const hash = await writeContract(config, simulation.request);
      setDepositHash(hash);

      const receipt = await waitForTransactionReceipt(config, {
        hash,
        chainId: appChain.id,
      });

      if (receipt.status !== "success") {
        throw new Error("The deposit transaction reverted on-chain.");
      }

      setDepositPhase("success");
      setDepositAmount("");

      await Promise.all([
        vaultBalance.refetch(),
        tokenBalance.refetch(),
        tokenAllowance.refetch(),
      ]);
    } catch (error) {
      setDepositError(explain(error));
      setDepositPhase("error");
    }
  }

  async function handleSetAgentPolicy() {
    if (!address || !vaultAddress || !isVaultOwner || !onChain) {
      setPolicyError("Connect the vault owner wallet on the selected network.");
      setPolicyPhase("error");
      return;
    }

    if (!isAddress(agentInput.trim())) {
      setPolicyError("Enter a valid Ethereum agent address.");
      setPolicyPhase("error");
      return;
    }

    let maxAmount: bigint;
    let dailyAmount: bigint;

    try {
      maxAmount = parseUnits(maxPerPaymentInput.trim(), decimals);
      dailyAmount = parseUnits(dailyLimitInput.trim(), decimals);

      if (maxAmount <= 0n || dailyAmount <= 0n) {
        throw new Error("Both spending limits must be greater than zero.");
      }

      if (maxAmount > dailyAmount) {
        throw new Error("Maximum per payment cannot exceed the daily limit.");
      }
    } catch (error) {
      setPolicyError(error instanceof Error ? error.message : "Invalid spending limits.");
      setPolicyPhase("error");
      return;
    }

    const expiryMilliseconds = Date.parse(validUntilInput);

    if (!Number.isFinite(expiryMilliseconds) || expiryMilliseconds <= Date.now()) {
      setPolicyError("Choose a valid expiry date and time in the future.");
      setPolicyPhase("error");
      return;
    }

    const expirySeconds = BigInt(Math.floor(expiryMilliseconds / 1000));

    setPolicyError(null);
    setPolicyHash(null);
    setPolicyPhase("pending");

    try {
      const simulation = await simulateContract(config, {
        account: address,
        address: vaultAddress,
        abi: agentPolicyVaultAbi,
        functionName: "setAgentPolicy",
        args: [
          agentInput.trim() as `0x${string}`,
          maxAmount,
          dailyAmount,
          expirySeconds,
        ],
        chainId: appChain.id,
      });

      const hash = await writeContract(config, simulation.request);
      setPolicyHash(hash);

      const receipt = await waitForTransactionReceipt(config, {
        hash,
        chainId: appChain.id,
      });

      if (receipt.status !== "success") {
        throw new Error("The agent policy transaction reverted on-chain.");
      }

      setPolicyPhase("success");

      await Promise.all([
        agent.refetch(),
        agentActive.refetch(),
        maxPerPayment.refetch(),
        dailyLimit.refetch(),
        validUntil.refetch(),
      ]);
    } catch (error) {
      setPolicyError(explain(error));
      setPolicyPhase("error");
    }
  }

  async function handleSetRecipientPermission() {
    if (!address || !vaultAddress || !isVaultOwner || !onChain) {
      setRecipientError("Connect the vault owner wallet on the selected network.");
      setRecipientPhase("error");
      return;
    }

    const recipient = recipientInput.trim();

    if (!isAddress(recipient) || recipient.toLowerCase() === zeroAddress) {
      setRecipientError("Enter a valid, non-zero recipient address.");
      setRecipientPhase("error");
      return;
    }

    setRecipientError(null);
    setRecipientHash(null);
    setRecipientPhase("pending");

    try {
      const simulation = await simulateContract(config, {
        account: address,
        address: vaultAddress,
        abi: agentPolicyVaultAbi,
        functionName: "setRecipientAllowed",
        args: [recipient as `0x${string}`, recipientAllowedInput],
        chainId: appChain.id,
      });

      const hash = await writeContract(config, simulation.request);
      setRecipientHash(hash);

      const receipt = await waitForTransactionReceipt(config, {
        hash,
        chainId: appChain.id,
      });

      if (receipt.status !== "success") {
        throw new Error("The recipient permission transaction reverted on-chain.");
      }

      setRecipientPhase("success");
      await recipientAllowed.refetch();
    } catch (error) {
      setRecipientError(explain(error));
      setRecipientPhase("error");
    }
  }

  async function handleRevokeAgent() {
    if (!address || !vaultAddress || !isVaultOwner || !onChain) {
      setRevokeError("Connect the vault owner wallet on the selected network.");
      setRevokePhase("error");
      return;
    }

    if (!agentActive.data) {
      setRevokeError("There is no active agent policy to revoke.");
      setRevokePhase("error");
      return;
    }

    setRevokeError(null);
    setRevokeHash(null);
    setRevokePhase("pending");

    try {
      const simulation = await simulateContract(config, {
        account: address,
        address: vaultAddress,
        abi: agentPolicyVaultAbi,
        functionName: "revokeAgent",
        args: [],
        chainId: appChain.id,
      });

      const hash = await writeContract(config, simulation.request);
      setRevokeHash(hash);

      const receipt = await waitForTransactionReceipt(config, {
        hash,
        chainId: appChain.id,
      });

      if (receipt.status !== "success") {
        throw new Error("The agent revocation transaction reverted on-chain.");
      }

      setRevokePhase("success");
      await agentActive.refetch();
    } catch (error) {
      setRevokeError(explain(error));
      setRevokePhase("error");
    }
  }

  async function handleGenerateProposal() {
    const message = aiMessage.trim();

    if (!message || message.length > 2000) {
      setAiError("Enter a request between 1 and 2000 characters.");
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    setAiApproval(null);
    setAiApplyStatus("");

    try {
      const response = await fetch("/api/ai/payment-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to generate a payment proposal.");
      }

      setAiResult(result);
      setAiApproval("pending");
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "Unable to generate a payment proposal.",
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function handleExecutePayment() {
    if (!address || !vaultAddress || !onChain) {
      setPaymentError("Connect a wallet on the selected network.");
      setPaymentPhase("error");
      return;
    }

    if (!agent.data || address.toLowerCase() !== agent.data.toLowerCase()) {
      setPaymentError("Connect the authorized agent wallet to execute payments.");
      setPaymentPhase("error");
      return;
    }

    if (!agentActive.data) {
      setPaymentError("The agent is inactive. The vault owner must authorize it first.");
      setPaymentPhase("error");
      return;
    }

    const recipient = paymentRecipient.trim();

    if (!isAddress(recipient) || recipient.toLowerCase() === zeroAddress) {
      setPaymentError("Enter a valid, non-zero recipient address.");
      setPaymentPhase("error");
      return;
    }

    let amount: bigint;

    try {
      amount = parseUnits(paymentAmount.trim(), decimals);

      if (amount <= 0n) {
        throw new Error("Payment amount must be greater than zero.");
      }
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Enter a valid payment amount.");
      setPaymentPhase("error");
      return;
    }

    if (!recipientAllowed.data && !paymentRecipientAllowed.data) {
      setPaymentError("This recipient is not allowlisted by the vault owner.");
      setPaymentPhase("error");
      return;
    }

    if (maxPerPayment.data !== undefined && amount > maxPerPayment.data) {
      setPaymentError("Payment exceeds the maximum amount per transaction.");
      setPaymentPhase("error");
      return;
    }

    if (remainingLimit.data !== undefined && amount > remainingLimit.data) {
      setPaymentError("Payment exceeds the remaining daily spending limit.");
      setPaymentPhase("error");
      return;
    }

    if (vaultBalance.data !== undefined && amount > vaultBalance.data) {
      setPaymentError("Insufficient funds in the agent treasury.");
      setPaymentPhase("error");
      return;
    }

    if (validUntil.data !== undefined && BigInt(Math.floor(Date.now() / 1000)) > validUntil.data) {
      setPaymentError("The agent policy has expired.");
      setPaymentPhase("error");
      return;
    }

    setPaymentError(null);
    setPaymentHash(null);
    setPaymentPhase("pending");

    try {
      const isAllowed = await readContract(config, {
        address: vaultAddress,
        abi: agentPolicyVaultAbi,
        functionName: "allowedRecipients",
        args: [recipient as `0x${string}`],
        chainId: appChain.id,
      });

      if (!isAllowed) {
        throw new Error("This recipient is not allowlisted by the vault owner.");
      }

      const simulation = await simulateContract(config, {
        account: address,
        address: vaultAddress,
        abi: agentPolicyVaultAbi,
        functionName: "executePayment",
        args: [recipient as `0x${string}`, amount],
        chainId: appChain.id,
      });

      const hash = await writeContract(config, simulation.request);
      setPaymentHash(hash);

      const receipt = await waitForTransactionReceipt(config, {
        hash,
        chainId: appChain.id,
      });

      if (receipt.status !== "success") {
        throw new Error("The payment transaction reverted on-chain.");
      }

      setPaymentPhase("success");
      setPaymentAmount("");

      await Promise.all([
        spentToday.refetch(),
        remainingLimit.refetch(),
        vaultBalance.refetch(),
      ]);
    } catch (error) {
      setPaymentError(explain(error));
      setPaymentPhase("error");
    }
  }

  const reads = [
    owner,
    agent,
    agentActive,
    maxPerPayment,
    dailyLimit,
    spentToday,
    remainingLimit,
    vaultBalance,
    validUntil,
  ];

  const isLoading = reads.some((read) => read.isLoading);
  const hasError = reads.some((read) => read.isError);

  const symbol = token.symbol;
  const decimals = token.decimals;

  return (
    <main className="shell dashboard">
      <div className="page-head">
        <div>
          <p className="dashboard-eyebrow">PAYFLOW AI</p>
          <h1>Agent Treasury</h1>
          <p>Monitor your vault, agent permissions and payment spending.</p>
        </div>

        <span className="pill">READ ONLY</span>
      </div>

      <section className="dashboard-network">
        <span>Network: <strong>{net.label}</strong></span>
        <span>Vault: <strong>{shortAddress(vaultAddress)}</strong></span>
      </section>

      {!isConnected && (
        <div className="card dashboard-notice">
          <h3>Connect your wallet</h3>
          <p>Connect your wallet to read the AgentPolicyVault data.</p>
        </div>
      )}

      {isConnected && !onChain && (
        <div className="card dashboard-notice">
          <h3>Wrong network</h3>
          <p>
            Your wallet is connected to chain {chainId}, but this dashboard
            is configured for {appChain.name} (chain {appChain.id}).
            Switch to the selected network.
          </p>
        </div>
      )}

      {isConnected && onChain && !vaultAddress && (
        <div className="card dashboard-notice">
          <h3>Vault address not configured</h3>
          <p>
            Add the AgentPolicyVault address to the environment configuration
            for this network.
          </p>
        </div>
      )}

      {canRead && isLoading && (
        <div className="card dashboard-notice">
          Reading live vault data from the blockchain...
        </div>
      )}

      {canRead && hasError && (
        <div className="card dashboard-notice">
          <h3>Unable to read vault data</h3>
          <p>
            Check that Anvil is running, the vault address is correct,
            and your wallet is connected to the selected network.
          </p>
        </div>
      )}

      {canRead && !isLoading && !hasError && (
        <>
          <section className="dashboard-grid">
            <article className="card dashboard-metric">
              <p>Vault balance</p>
              <h2>{formatAmount(vaultBalance.data, decimals, symbol)}</h2>
              <span>Available treasury funds</span>
            </article>

            <article className="card dashboard-metric">
              <p>Spent today</p>
              <h2>{formatAmount(spentToday.data, decimals, symbol)}</h2>
              <span>Agent payments recorded today</span>
            </article>

            <article className="card dashboard-metric">
              <p>Daily remaining</p>
              <h2>{formatAmount(remainingLimit.data, decimals, symbol)}</h2>
              <span>Remaining authorized spending</span>
            </article>

            <article className="card dashboard-metric">
              <p>Maximum per payment</p>
              <h2>{formatAmount(maxPerPayment.data, decimals, symbol)}</h2>
              <span>Contract-enforced payment ceiling</span>
            </article>
          </section>

          <section className="card dashboard-section">
            <div className="dashboard-section-heading">
              <div>
                <h2>Deposit funds</h2>
                <p>Add tUSD8 to your agent treasury. Only the vault owner can deposit.</p>
              </div>
              <span className="pill">
                {isVaultOwner ? "OWNER ACCESS" : "VIEW ONLY"}
              </span>
            </div>

            <div className="dashboard-details">
              <div>
                <span>Your wallet balance</span>
                <strong>{formatAmount(tokenBalance.data, decimals, symbol)}</strong>
              </div>
              <div>
                <span>Current vault allowance</span>
                <strong>{formatAmount(tokenAllowance.data, decimals, symbol)}</strong>
              </div>
            </div>

            {isVaultOwner ? (
              <div style={{ display: "grid", gap: "12px", maxWidth: "440px", marginTop: "20px" }}>
                <label htmlFor="deposit-amount">Deposit amount ({symbol})</label>
                <input
                  id="deposit-amount"
                  className="input"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g. 25"
                  value={depositAmount}
                  onChange={(event) => {
                    setDepositAmount(event.target.value);
                    setDepositError(null);
                    if (depositPhase === "error" || depositPhase === "success") {
                      setDepositPhase("idle");
                    }
                  }}
                  disabled={depositPhase === "approving" || depositPhase === "depositing"}
                />

                <button
                  className="btn"
                  type="button"
                  onClick={handleDeposit}
                  disabled={
                    !depositAmount.trim() ||
                    depositPhase === "approving" ||
                    depositPhase === "depositing"
                  }
                >
                  {depositPhase === "approving"
                    ? "Waiting for token approval..."
                    : depositPhase === "depositing"
                      ? "Waiting for deposit confirmation..."
                      : "Deposit tUSD8"}
                </button>

                {depositPhase === "success" && (
                  <p className="status-pill success">
                    Deposit confirmed. Your treasury balance has been refreshed.
                  </p>
                )}

                {depositPhase === "error" && depositError && (
                  <p className="status-pill" role="alert">{depositError}</p>
                )}

                {depositHash && (
                  <p>
                    Transaction: <code>{shortAddress(depositHash)}</code>
                  </p>
                )}
              </div>
            ) : (
              <p className="dashboard-notice">
                Connect the vault owner wallet to deposit funds.
              </p>
            )}
          </section>

          <section className="card dashboard-section">
            <div className="dashboard-section-heading">
              <div>
                <h2>Configure agent</h2>
                <p>Authorize an agent and define its on-chain spending permissions.</p>
              </div>
              <span className="pill">OWNER ONLY</span>
            </div>

            {isVaultOwner ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSetAgentPolicy();
                }}
                style={{ display: "grid", gap: "14px", maxWidth: "520px", marginTop: "20px" }}
              >
                <div>
                  <label htmlFor="agent-address">Agent wallet address</label>
                  <input
                    id="agent-address"
                    className="input"
                    type="text"
                    placeholder="0x..."
                    value={agentInput}
                    onChange={(event) => setAgentInput(event.target.value)}
                    required
                    disabled={policyPhase === "pending"}
                  />
                </div>

                <div>
                  <label htmlFor="max-payment">Maximum per payment ({symbol})</label>
                  <input
                    id="max-payment"
                    className="input"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="5"
                    value={maxPerPaymentInput}
                    onChange={(event) => setMaxPerPaymentInput(event.target.value)}
                    required
                    disabled={policyPhase === "pending"}
                  />
                </div>

                <div>
                  <label htmlFor="daily-limit">Daily spending limit ({symbol})</label>
                  <input
                    id="daily-limit"
                    className="input"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="20"
                    value={dailyLimitInput}
                    onChange={(event) => setDailyLimitInput(event.target.value)}
                    required
                    disabled={policyPhase === "pending"}
                  />
                </div>

                <div>
                  <label htmlFor="policy-expiry">Policy expiry</label>
                  <input
                    id="policy-expiry"
                    className="input"
                    type="datetime-local"
                    value={validUntilInput}
                    onChange={(event) => setValidUntilInput(event.target.value)}
                    required
                    disabled={policyPhase === "pending"}
                  />
                </div>

                <button
                  className="btn"
                  type="submit"
                  disabled={
                    policyPhase === "pending" ||
                    !agentInput.trim() ||
                    !maxPerPaymentInput.trim() ||
                    !dailyLimitInput.trim() ||
                    !validUntilInput
                  }
                >
                  {policyPhase === "pending" ? "Waiting for confirmation..." : "Save agent policy"}
                </button>

                {policyPhase === "success" && (
                  <p className="status-pill success">
                    Agent policy updated successfully.
                  </p>
                )}

                {policyPhase === "error" && policyError && (
                  <p className="status-pill" role="alert">{policyError}</p>
                )}

                {policyHash && (
                  <p>Transaction: <code>{shortAddress(policyHash)}</code></p>
                )}

                <p className="dashboard-notice">
                  Updating a policy does not reset the agent's existing daily spending.
                </p>
              </form>
            ) : (
              <p className="dashboard-notice">
                Connect the vault owner wallet to configure agent permissions.
              </p>
            )}
          </section>

          <section className="card dashboard-section">
            <div className="dashboard-section-heading">
              <div>
                <h2>Recipient allowlist</h2>
                <p>Control which wallet addresses the agent is permitted to pay.</p>
              </div>
              <span className="pill">OWNER ONLY</span>
            </div>

            {isVaultOwner ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSetRecipientPermission();
                }}
                style={{ display: "grid", gap: "14px", maxWidth: "520px", marginTop: "20px" }}
              >
                <div>
                  <label htmlFor="recipient-address">Recipient wallet address</label>
                  <input
                    id="recipient-address"
                    className="input"
                    type="text"
                    placeholder="0x..."
                    value={recipientInput}
                    onChange={(event) => {
                      setRecipientInput(event.target.value);
                      setRecipientError(null);
                      setRecipientPhase("idle");
                      setRecipientHash(null);
                    }}
                    required
                    disabled={recipientPhase === "pending"}
                  />
                </div>

                {isAddress(recipientInput.trim()) && (
                  <div className="dashboard-details">
                    <div>
                      <span>Current on-chain permission</span>
                      <strong>
                        {recipientAllowed.isLoading
                          ? "Checking..."
                          : recipientAllowed.isError
                            ? "Unable to load"
                            : recipientAllowed.data
                              ? "Allowed"
                              : "Not allowed"}
                      </strong>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="recipient-permission">Permission to set</label>
                  <select
                    id="recipient-permission"
                    className="input"
                    value={recipientAllowedInput ? "allow" : "disallow"}
                    onChange={(event) => setRecipientAllowedInput(event.target.value === "allow")}
                    disabled={recipientPhase === "pending"}
                  >
                    <option value="allow">Allow recipient</option>
                    <option value="disallow">Disallow recipient</option>
                  </select>
                </div>

                <button
                  className="btn"
                  type="submit"
                  disabled={
                    recipientPhase === "pending" ||
                    !isAddress(recipientInput.trim())
                  }
                >
                  {recipientPhase === "pending"
                    ? "Waiting for confirmation..."
                    : "Save recipient permission"}
                </button>

                {recipientPhase === "success" && (
                  <p className="status-pill success">
                    Recipient permission updated successfully.
                  </p>
                )}

                {recipientPhase === "error" && recipientError && (
                  <p className="status-pill" role="alert">{recipientError}</p>
                )}

                {recipientHash && (
                  <p>Transaction: <code>{shortAddress(recipientHash)}</code></p>
                )}
              </form>
            ) : (
              <p className="dashboard-notice">
                Connect the vault owner wallet to manage recipient permissions.
              </p>
            )}
          </section>

          <section className="card dashboard-section">
            <div className="dashboard-section-heading">
              <div>
                <h2>AI payment assistant</h2>
                <p>Describe a payment in natural language. PayFlow AI will prepare a proposal for your review.</p>
              </div>
              <span className="pill">AI PROPOSAL</span>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleGenerateProposal();
              }}
              style={{ display: "grid", gap: "14px", maxWidth: "620px", marginTop: "20px" }}
            >
              <label htmlFor="ai-payment-request">What payment should the agent make?</label>
              <textarea
                id="ai-payment-request"
                className="input"
                rows={3}
                maxLength={2000}
                placeholder="Example: Pay 2 tUSD8 to 0x... for development services"
                value={aiMessage}
                onChange={(event) => {
                  setAiMessage(event.target.value);
                  setAiError(null);
                }}
                disabled={aiLoading}
                required
              />

              <button
                className="btn"
                type="submit"
                disabled={aiLoading || !aiMessage.trim()}
              >
                {aiLoading ? "Analyzing request..." : "Generate payment proposal"}
              </button>

              {aiError && (
                <p className="status-pill" role="alert">{aiError}</p>
              )}
            </form>

            {aiResult && (
              <div className="dashboard-notice" style={{ marginTop: "20px" }}>
                <h3>Payment proposal</h3>
                <p>{aiResult.proposal.summary}</p>

                <div className="dashboard-details">
                  <div>
                    <span>Recipient</span>
                    <strong>{aiResult.proposal.recipientAddress ?? "Missing"}</strong>
                  </div>
                  <div>
                    <span>Amount</span>
                    <strong>
                      {aiResult.proposal.amount
                        ? `${aiResult.proposal.amount} ${aiResult.proposal.tokenSymbol}`
                        : "Missing"}
                    </strong>
                  </div>
                  <div>
                    <span>Purpose</span>
                    <strong>{aiResult.proposal.purpose || "Not specified"}</strong>
                  </div>
                  <div>
                    <span>Provider</span>
                    <strong>{aiResult.provider}</strong>
                  </div>
                </div>

                {aiResult.proposal.missingInformation.length > 0 && (
                  <p role="alert">
                    Missing information: {aiResult.proposal.missingInformation.join(", ")}.
                  </p>
                )}

                <p>
                  {aiApproval === "approved"
                    ? "Proposal approved by you. No transaction has been submitted."
                    : aiApproval === "rejected"
                      ? "Proposal rejected. It cannot be used for payment."
                      : "Awaiting your approval. No transaction has been submitted."}
                </p>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    className="btn"
                    type="button"
                    disabled={
                      !aiResult.readyForReview ||
                      !aiResult.requiresHumanApproval ||
                      aiResult.transactionSubmitted ||
                      aiApproval !== "pending"
                    }
                    onClick={() => {
                      setAiApproval("approved");
                      setAiApplyStatus("");
                    }}
                  >
                    Approve proposal
                  </button>

                  <button
                    className="btn"
                    type="button"
                    disabled={aiApproval !== "pending"}
                    onClick={() => {
                      const rejectedRecipient =
                        aiResult.proposal.recipientAddress;
                      const rejectedAmount = aiResult.proposal.amount;

                      if (
                        rejectedRecipient &&
                        rejectedAmount &&
                        paymentRecipient.toLowerCase() === rejectedRecipient.toLowerCase() &&
                        paymentAmount === rejectedAmount
                      ) {
                        setPaymentRecipient("");
                        setPaymentAmount("");
                        setPaymentError(null);
                        setPaymentPhase("idle");
                        setPaymentHash(null);
                      }

                      setAiApproval("rejected");
                      setAiApplyStatus("");
                    }}
                  >
                    Reject proposal
                  </button>
                </div>

                {aiApproval === "approved" && (
                  <button
                    className="btn"
                    type="button"
                    disabled={
                      !aiResult.proposal.recipientAddress ||
                      !aiResult.proposal.amount ||
                      aiResult.transactionSubmitted
                    }
                    onClick={() => {
                      if (
                        !aiResult.proposal.recipientAddress ||
                        !aiResult.proposal.amount
                      ) return;

                      setPaymentRecipient(aiResult.proposal.recipientAddress);
                      setPaymentAmount(aiResult.proposal.amount);
                      setPaymentError(null);
                      setPaymentPhase("idle");
                      setPaymentHash(null);
                      setAiApplyStatus("Approved proposal copied into the Agent Payment form.");
                    }}
                  >
                    Use approved proposal in agent payment form
                  </button>
                )}

                {aiApplyStatus && (
                  <p className="status-pill success" role="status">{aiApplyStatus}</p>
                )}
              </div>
            )}
          </section>

          <section className="card dashboard-section">
            <div className="dashboard-section-heading">
              <div>
                <h2>Agent payment</h2>
                <p>Execute a treasury payment using the authorized agent wallet.</p>
              </div>
              <span className="pill">AGENT ONLY</span>
            </div>

            {address && agent.data && address.toLowerCase() === agent.data.toLowerCase() ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleExecutePayment();
                }}
                style={{ display: "grid", gap: "14px", maxWidth: "520px", marginTop: "20px" }}
              >
                <div className="dashboard-details">
                  <div>
                    <span>Agent status</span>
                    <strong>{agentActive.data ? "Active" : "Inactive"}</strong>
                  </div>
                  <div>
                    <span>Remaining daily limit</span>
                    <strong>{formatAmount(remainingLimit.data, decimals, symbol)}</strong>
                  </div>
                </div>

                <div>
                  <label htmlFor="payment-recipient">Payment recipient</label>
                  <input
                    id="payment-recipient"
                    className="input"
                    type="text"
                    placeholder="0x..."
                    value={paymentRecipient}
                    onChange={(event) => {
                      setPaymentRecipient(event.target.value);
                      setPaymentError(null);
                      setPaymentPhase("idle");
                      setPaymentHash(null);
                    }}
                    required
                    disabled={paymentPhase === "pending"}
                  />
                  {isAddress(paymentRecipient.trim()) && (
                    <p className="dashboard-notice">
                      {paymentRecipientAllowed.isLoading
                        ? "Checking recipient permission..."
                        : paymentRecipientAllowed.data
                          ? "Recipient is allowlisted."
                          : "Recipient is not allowlisted."}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="payment-amount">Payment amount ({symbol})</label>
                  <input
                    id="payment-amount"
                    className="input"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="e.g. 2"
                    value={paymentAmount}
                    onChange={(event) => {
                      setPaymentAmount(event.target.value);
                      setPaymentError(null);
                      setPaymentPhase("idle");
                      setPaymentHash(null);
                    }}
                    required
                    disabled={paymentPhase === "pending"}
                  />
                </div>

                <button
                  className="btn"
                  type="submit"
                  disabled={
                    !agentActive.data ||
                    paymentPhase === "pending" ||
                    !isAddress(paymentRecipient.trim()) ||
                    !paymentAmount.trim()
                  }
                >
                  {paymentPhase === "pending"
                    ? "Waiting for payment confirmation..."
                    : "Execute payment"}
                </button>

                {paymentPhase === "success" && (
                  <p className="status-pill success">
                    Payment confirmed. Treasury spending has been refreshed.
                  </p>
                )}

                {paymentPhase === "error" && paymentError && (
                  <p className="status-pill" role="alert">{paymentError}</p>
                )}

                {paymentHash && (
                  <p>Transaction: <code>{shortAddress(paymentHash)}</code></p>
                )}
              </form>
            ) : (
              <p className="dashboard-notice">
                Connect the authorized agent wallet to execute payments. The vault owner wallet cannot execute agent payments.
              </p>
            )}
          </section>

          <section className="card dashboard-section">
            <div className="dashboard-section-heading">
              <div>
                <h2>Agent policy</h2>
                <p>Permissions enforced directly by the smart contract.</p>
              </div>

              <span className={agentActive.data ? "status-pill success" : "status-pill"}>
                {agentActive.data ? "Agent active" : "Agent inactive"}
              </span>
            </div>

            <div className="dashboard-details">
              <div>
                <span>Vault owner</span>
                <strong>{shortAddress(owner.data)}</strong>
              </div>

              <div>
                <span>Authorized agent</span>
                <strong>{shortAddress(agent.data)}</strong>
              </div>

              <div>
                <span>Daily spending limit</span>
                <strong>{formatAmount(dailyLimit.data, decimals, symbol)}</strong>
              </div>

              <div>
                <span>Policy expiry</span>
                <strong>{formatExpiry(validUntil.data)}</strong>
              </div>
            </div>

            {isVaultOwner && (
              <div style={{ display: "grid", gap: "12px", maxWidth: "440px", marginTop: "20px" }}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => void handleRevokeAgent()}
                  disabled={!agentActive.data || revokePhase === "pending"}
                >
                  {revokePhase === "pending"
                    ? "Waiting for confirmation..."
                    : agentActive.data
                      ? "Revoke agent access"
                      : "Agent access revoked"}
                </button>

                {revokePhase === "success" && (
                  <p className="status-pill success">
                    Agent access revoked. The contract will reject further agent payments.
                  </p>
                )}

                {revokePhase === "error" && revokeError && (
                  <p className="status-pill" role="alert">{revokeError}</p>
                )}

                {revokeHash && (
                  <p>Transaction: <code>{shortAddress(revokeHash)}</code></p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
