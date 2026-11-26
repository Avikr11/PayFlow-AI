# PayFlow AI

**AI-assisted stablecoin payments with smart-contract-enforced spending policies on QDay Aevum.**

PayFlow AI gives a business owner a way to fund a stablecoin vault, authorize a payment agent, define spending rules, and review payment proposals before execution.

The AI helps interpret payment instructions. The smart contract—not the AI—enforces the payment permissions and spending limits.

> **Project status:** Smart contracts, dashboard, AI proposal workflow, and local Anvil end-to-end demonstration implemented. Aevum testnet deployment is pending.

---

## The problem

Businesses may want to automate routine stablecoin payments without giving an AI agent unrestricted access to their treasury.

A conventional wallet authorization can give an automated process more authority than it needs. A natural-language payment request also should not be treated as sufficient authorization to move funds.

PayFlow AI addresses this by separating payment intent, human approval, and on-chain execution.

## The solution

A business owner deposits tUSD8 into an `AgentPolicyVault` and configures an agent with explicit permissions.

The agent can execute payments only when the smart contract's rules are satisfied.

The owner controls:

- Which agent is authorized.
- The maximum amount per payment.
- The daily spending limit.
- The policy expiry.
- Which recipient addresses are allowlisted.
- Whether the agent is revoked.
- When to withdraw treasury funds.

The AI payment assistant turns a payment instruction into a structured proposal. The user reviews and approves that proposal before transferring its details into the payment form.

**The AI does not hold the owner's unrestricted wallet authority, and the proposal API does not submit transactions.**

## Features

### Policy-controlled treasury

- Deposit and withdraw tUSD8.
- Configure an authorized payment agent.
- Set a maximum amount per payment.
- Set a daily spending limit.
- Set an expiry timestamp.
- Allow or disallow individual recipients.
- Revoke the agent.
- Read vault balance and remaining daily spending limit.

### AI payment assistant

- Accept a payment instruction in natural language.
- Extract a recipient address, tUSD8 amount, and optional purpose.
- Return a structured payment proposal.
- Identify missing payment information.
- Require explicit human approval in the dashboard.
- Allow an approved proposal to populate the agent payment form.
- Prevent a rejected proposal from being used through the approval workflow.

### On-chain enforcement

`AgentPolicyVault` independently checks:

- The caller is the authorized active agent.
- The agent policy has not expired.
- The recipient is allowlisted.
- The payment amount is nonzero.
- The payment does not exceed the per-payment limit.
- The payment does not exceed the remaining daily limit.
- The vault has sufficient token balance.

The contract updates spending accounting before transferring tokens and uses OpenZeppelin's `SafeERC20` and `ReentrancyGuard`.

### Dashboard

- Wallet connection and network selection.
- Treasury balance and spending metrics.
- Owner controls for deposits and policy configuration.
- Recipient allowlist management.
- Agent payment execution.
- Agent revocation.
- AI proposal review and approval workflow.

---

## How it works

1. **Connect:** The owner connects their wallet.
2. **Fund:** The owner deposits tUSD8 into the vault.
3. **Configure:** The owner selects an agent and sets payment, daily spending, and expiry limits.
4. **Allowlist:** The owner authorizes recipient addresses.
5. **Propose:** The user describes a payment to the AI assistant.
6. **Review:** The assistant returns a structured proposal for human review.
7. **Approve:** The user explicitly approves the proposal.
8. **Execute:** The authorized agent wallet submits the payment transaction.
9. **Enforce:** The vault checks all policy conditions before transferring tokens.
10. **Verify:** The dashboard refreshes the on-chain spending and balance information.

A proposal is not a transaction. Approval in the dashboard does not bypass the smart contract's policy checks.

---

## Architecture

```text
                 Business Owner
                       |
                       v
                PayFlow AI Dashboard
                       |
            +----------+----------+
            |                     |
            v                     v
      AI Payment API        Owner Controls
            |                     |
            v                     v
    Structured Proposal    AgentPolicyVault
            |                     ^
            v                     |
     Human Approval               |
            |                     |
            v                     |
    Agent Payment Form             |
            |                     |
            v                     |
      Agent Wallet ----------------+
            |
            v
     executePayment()
            |
            v
    On-chain Policy Checks
            |
            v
       tUSD8 Transfer
            |
            v
       Allowlisted Recipient
```

### Smart contracts

#### `AgentPolicyVault.sol`

The main treasury and policy-enforcement contract.

Important functions:

| Function | Purpose |
|---|---|
| `deposit(amount)` | Deposit tokens into the vault |
| `setAgentPolicy(...)` | Configure the authorized agent and spending rules |
| `revokeAgent()` | Disable agent authorization |
| `setRecipientAllowed(...)` | Manage recipient permissions |
| `executePayment(...)` | Execute a policy-checked payment |
| `withdraw(amount)` | Withdraw vault funds as owner |
| `getRemainingDailyLimit()` | Read remaining daily allowance |
| `getVaultBalance()` | Read vault token balance |

The current implementation uses one owner, one active agent, one token, and a shared daily spending counter.

#### `Checkout.sol`

The starter checkout contract is retained for stablecoin checkout demonstrations.

It supports:

- Standard ERC-20 approval and payment.
- EIP-3009 `receiveWithAuthorization` payments.
- Order-bound authorization nonces.
- Payment records and payment events.

The checkout flow is separate from the policy-controlled agent treasury.

### Technology stack

- Solidity
- Foundry
- OpenZeppelin Contracts
- QDay Aevum EVM
- tUSD8
- Next.js
- React
- TypeScript
- Tailwind CSS
- Wagmi
- Viem
- RainbowKit
- OpenAI Responses API integration
- Rule-based mock payment proposal provider

---

## AI provider and limitations

The application supports two proposal providers.

### Mock provider

Set:

```env
AI_PROVIDER=mock
```

The mock provider uses deterministic rule-based extraction. It recognizes payment requests beginning with `pay`, `send`, or `transfer`, and extracts a wallet address and a tUSD8 amount.

It can identify missing recipient or amount information and returns a structured proposal.

This is a deliberately limited parser, not a full natural-language reasoning model.

### OpenAI provider

The API also includes an OpenAI Responses API integration with structured JSON output.

Configure:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-5-mini
```

The OpenAI API key is server-side only. Do not use a `NEXT_PUBLIC_` prefix for it.

The OpenAI provider requires an API account with available credits. The current demonstration configuration uses the mock provider.

### AI safety boundaries

- The proposal API does not sign or submit transactions.
- Proposals require human approval in the dashboard.
- The AI cannot override recipient permissions or spending limits.
- The vault independently enforces policy at execution time.
- The mock parser supports a limited payment-request format.

---

## Security model and known limitations

PayFlow AI is a prototype and has not undergone an independent security audit.

Important design boundaries:

- The owner retains control of the vault and can revoke the agent.
- The agent can only execute payments through the contract's policy checks.
- The agent wallet needs native tQDAY to pay transaction gas on Aevum.
- The current design does not implement ERC-4337 account abstraction or a gasless agent-payment relayer.
- Owner withdrawals remain possible while an agent is active. The actual vault balance still constrains payments.
- Daily spending accounting uses UTC day boundaries.
- The token integration assumes conventional ERC-20 transfer behavior. Fee-on-transfer and rebasing tokens are not supported.
- Direct token transfers to the vault are possible.
- The mock AI provider is a parser, not a production autonomous agent.
- The application-level human approval flow is not a substitute for on-chain authorization.

Do not use this prototype to custody production funds.

---

## Getting started

### Requirements

- Node.js 22 or newer
- pnpm
- Foundry
- Git

### Install dependencies

```bash
git clone https://github.com/Avikr11/PayFlow-AI.git
cd PayFlow-AI

make install
```

### Run the checks

```bash
make check
```

This runs the Solidity build, Shanghai compatibility check, local contract tests, Aevum fork tests, and TypeScript type checks.

### Run the local Anvil demonstration

Start Anvil in one terminal:

```bash
make anvil
```

Keep this terminal running.

In a second terminal, deploy the local contracts:

```bash
cd ~/aevum-starter-kit
make deploy-local
```

The local deployment uses a mock USD8 token. The deployment output provides the token, checkout, and vault addresses.

Configure `web/.env.local`:

```env
NEXT_PUBLIC_NETWORKS=local

NEXT_PUBLIC_CHECKOUT_LOCAL=YOUR_LOCAL_CHECKOUT_ADDRESS
NEXT_PUBLIC_VAULT_LOCAL=YOUR_LOCAL_VAULT_ADDRESS

AI_PROVIDER=mock
```

Use the actual addresses printed by the deployment command. Do not commit `.env.local`.

Start the web application:

```bash
pnpm --dir web dev
```

Open:

```text
http://localhost:3000/dashboard
```

Connect the local Anvil wallet in MetaMask. Use the local Anvil network:

- Network name: Anvil
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency symbol: ETH

For local testing only, Anvil's default accounts are funded with test ETH. Never use their publicly known private keys for real funds.

Restarting Anvil resets its local blockchain state. Redeploy the contracts and update the local configuration after a reset.

---

## Aevum network

The intended deployment network is QDay Aevum Testnet.

| Setting | Value |
|---|---|
| Network | QDay Aevum Testnet |
| Chain ID | `44005` |
| RPC | `https://rpc-test.qday.info` |
| Explorer | `https://explorer-test.qday.info` |
| Native gas token | tQDAY |
| Stablecoin | tUSD8 |
| tUSD8 address | `0x456569838f1d43009A91ebA4263147Afd7233483` |
| tUSD8 decimals | `6` |

The contracts must be compiled for the Shanghai EVM target.

### Testnet deployment status

**Pending.** The contracts have been tested locally and against the Aevum testnet fork. A live Aevum testnet deployment and live transaction demonstration have not yet been completed.

Once testnet funding is available:

```bash
cast wallet import aevum-deployer --interactive
make deploy-aevum ACCOUNT=aevum-deployer
```

Keep the private key and keystore password private. Never commit wallet credentials.

After deployment, add the actual Aevum contract addresses to the application's environment configuration and verify the live transactions using the Aevum explorer.

---

## Testing

Latest recorded project checks:

- 26 `AgentPolicyVault` unit tests passed.
- 11 `Checkout` tests passed, including fuzz testing.
- 3 Aevum fork integration tests passed.
- 40 Solidity tests passed in total.
- Shanghai compatibility check passed.
- Examples and web TypeScript checks passed.

The local Anvil workflow has also been exercised end to end:

- Owner deposited tokens.
- Owner configured an agent policy.
- Owner allowlisted a recipient.
- Agent executed a permitted payment.
- The dashboard refreshed the on-chain balance and spending allowance.
- AI proposal generation, approval, rejection, and transfer-to-payment-form workflows were tested.

These results are local/fork testing evidence, not proof of a live Aevum testnet deployment.

Run the checks yourself:

```bash
make check
```

---

## Project structure

```text
contracts/
  src/
    AgentPolicyVault.sol
    Checkout.sol
    mocks/
      MockUSD8.sol
  script/
    Deploy.s.sol
  test/
    AgentPolicyVault.t.sol
    Checkout.t.sol
    fork/

packages/
  aevum/

examples/

web/
  src/
    app/
      api/
        ai/
          payment-proposal/
      dashboard/
      checkout/
      activity/
      receipts/
    components/
    lib/
      abi/
      ai/
```

---

## Roadmap

- [x] AgentPolicyVault implementation
- [x] Per-payment spending limit
- [x] Daily spending limit
- [x] Recipient allowlist
- [x] Agent expiry and revocation
- [x] Treasury deposit and withdrawal
- [x] Foundry unit and fork tests
- [x] Dashboard owner controls
- [x] Agent payment workflow
- [x] AI proposal and human approval workflow
- [x] Local Anvil end-to-end demonstration
- [ ] Fund deployment wallet with testnet tQDAY
- [ ] Deploy contracts to Aevum testnet
- [ ] Complete live testnet payment demonstration
- [ ] Publish live demo and demo video
- [ ] Add deployed contract addresses and transaction hashes
- [ ] Independent security review

---

## Hackathon submission evidence

This section will be completed after the Aevum testnet deployment.

| Evidence | Status |
|---|---|
| Public source repository | Available |
| Local working prototype | Available |
| Contract test results | Available |
| Aevum testnet contract addresses | Pending |
| Aevum testnet transaction hashes | Pending |
| Live demo URL | Pending |
| Demo video | Pending |

Repository: https://github.com/Avikr11/PayFlow-AI

Network and deployment claims will be updated only after the corresponding transactions have been verified.

---

## License and acknowledgements

This project builds on the **Aevum Starter Kit** by QDay / PQA Labs.

The original starter kit is MIT licensed. Its license and copyright notices are retained. The original `LICENSE` and `NOTICE.md` files and applicable third-party notices are retained.

Original starter kit: https://github.com/qday-io/aevum-starter-kit

See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) for licensing information.
