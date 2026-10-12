require("dotenv").config();

const {
    Wallet,
    JsonRpcProvider,
    formatEther,
    parseEther
} = require("ethers");

const fs = require("node:fs");
const path = require("node:path");

const prefix = "0x17";
const walletFile = path.join(__dirname, "wallet.json");
const recipientFile = path.join(__dirname, "recipient.json");
const transactionFile = path.join(__dirname, "transaction.json");

function getWallet() {
    if (fs.existsSync(walletFile)) {
        const saved = JSON.parse(fs.readFileSync(walletFile, "utf8"));
        const wallet = new Wallet(saved.privateKey);

        console.log("Saved wallet loaded.");
        console.log("Address:", wallet.address);

        return wallet;
    }

    let wallet;
    let attempts = 0;

    console.log(`Searching for Ethereum address starting with ${prefix}...`);

    do {
        wallet = Wallet.createRandom();
        attempts++;

        if (attempts % 100 === 0) {
            console.log("Attempts:", attempts);
        }
    } while (!wallet.address.toLowerCase().startsWith(prefix));

    const data = {
        address: wallet.address,
        privateKey: wallet.privateKey,
        attempts: attempts
    };

    fs.writeFileSync(
        walletFile,
        JSON.stringify(data, null, 2),
        { flag: "wx" }
    );

    console.log("\nWallet found!");
    console.log("Address:", wallet.address);
    console.log("Private key:", wallet.privateKey);
    console.log("Attempts:", attempts);
    console.log("Saved to:", walletFile);

    return wallet;
}

function getRecipientAddress() {
    if (fs.existsSync(recipientFile)) {
        const saved = JSON.parse(fs.readFileSync(recipientFile, "utf8"));
        return saved.address;
    }

    const recipient = Wallet.createRandom();

    fs.writeFileSync(
        recipientFile,
        JSON.stringify({ address: recipient.address }, null, 2),
        { flag: "wx" }
    );

    return recipient.address;
}

async function main() {
    if (!process.env.ALCHEMY_RPC_URL) {
        throw new Error("ALCHEMY_RPC_URL is missing in the .env file.");
    }

    const wallet = getWallet();
    const provider = new JsonRpcProvider(process.env.ALCHEMY_RPC_URL);

    console.log("\nConnecting to Ethereum Sepolia...");

    const network = await provider.getNetwork();

    if (network.chainId !== 11155111n) {
        throw new Error(`Wrong network. Chain ID: ${network.chainId}`);
    }

    console.log("Network: Ethereum Sepolia");
    console.log("Chain ID:", network.chainId.toString());

    const balanceBefore = await provider.getBalance(wallet.address);

    console.log("Balance before transaction:", formatEther(balanceBefore), "ETH");

    if (fs.existsSync(transactionFile)) {
        const savedTransaction = JSON.parse(
            fs.readFileSync(transactionFile, "utf8")
        );

        console.log("\nTransaction was already sent.");
        console.log("Recipient:", savedTransaction.recipient);
        console.log("Amount:", savedTransaction.amount, "ETH");
        console.log("Transaction hash:", savedTransaction.hash);

        const receipt = await provider.getTransactionReceipt(
            savedTransaction.hash
        );

        if (receipt) {
            console.log("Status:", receipt.status === 1 ? "Success" : "Failed");
            console.log("Block:", receipt.blockNumber);
            console.log("Gas used:", receipt.gasUsed.toString());
        } else {
            console.log("Status: Pending");
        }

        return;
    }

    const recipientAddress = getRecipientAddress();
    const amount = parseEther("0.001");

    if (balanceBefore <= amount) {
        throw new Error("Insufficient balance for the transaction and gas.");
    }

    const connectedWallet = wallet.connect(provider);

    console.log("\nSending transaction...");
    console.log("Recipient:", recipientAddress);
    console.log("Amount: 0.001 ETH");

    const transaction = await connectedWallet.sendTransaction({
        to: recipientAddress,
        value: amount
    });

    fs.writeFileSync(
        transactionFile,
        JSON.stringify(
            {
                hash: transaction.hash,
                recipient: recipientAddress,
                amount: "0.001",
                status: "pending"
            },
            null,
            2
        )
    );

    console.log("Transaction hash:", transaction.hash);
    console.log("Waiting for confirmation...");

    const receipt = await transaction.wait();

    fs.writeFileSync(
        transactionFile,
        JSON.stringify(
            {
                hash: transaction.hash,
                recipient: recipientAddress,
                amount: "0.001",
                status: receipt.status === 1 ? "success" : "failed",
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString()
            },
            null,
            2
        )
    );

    const balanceAfter = await provider.getBalance(wallet.address);

    console.log("\nTransaction confirmed!");
    console.log("Status:", receipt.status === 1 ? "Success" : "Failed");
    console.log("Block:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());
    console.log("Balance after transaction:", formatEther(balanceAfter), "ETH");
    console.log(
        "Explorer:",
        `https://sepolia.etherscan.io/tx/${transaction.hash}`
    );
}

main().catch((error) => {
    console.error("\nError:", error.message);
    process.exitCode = 1;
});