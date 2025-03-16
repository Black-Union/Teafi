import axios from "axios";
import sendDepositTransaction from './swap.js';
import { formatUnits } from "ethers";
import log from './logger.js'

const TOKEN_ADDRESS = {
    WPOL: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
    TPOL: "0x1Cd0cd01c8C902AdAb3430ae04b9ea32CB309CF1",
    NETWORK_ID: 137,
    TYPE: 2 // Convert
};

function getTokenSymbol(address) {
    return Object.keys(TOKEN_ADDRESS).find(key => TOKEN_ADDRESS[key] === address) || "UNKNOWN";
}

async function sendTransaction(
    gasFee,
    isRetry = false,
    retries = 5,
    txHash,
    address,
    amount) {
    if (!isRetry) {
        try {
            ({ txHash, address, amount } = await sendDepositTransaction());
            if (!txHash) throw new Error("Transaction hash is undefined.");
        } catch (error) {
            log.error("❌ Failed to initiate transaction:", error.message);
            return null;
        }
    }

    log.info(`🚀 Trying to send tx report to backend:`, txHash)

    const fromTokenSymbol = getTokenSymbol(TOKEN_ADDRESS.WPOL);
    const toTokenSymbol = getTokenSymbol(TOKEN_ADDRESS.TPOL);

    const payload = {
        hash: txHash,
        blockchainId: TOKEN_ADDRESS.NETWORK_ID,
        type: TOKEN_ADDRESS.TYPE,
        walletAddress: address,
        fromTokenAddress: TOKEN_ADDRESS.WPOL,
        toTokenAddress: TOKEN_ADDRESS.TPOL,
        fromTokenSymbol,
        toTokenSymbol,
        fromAmount: amount,
        toAmount: amount,
        gasFeeTokenAddress: TOKEN_ADDRESS.POL,
        gasFeeTokenSymbol: fromTokenSymbol,
        gasFeeAmount: gasFee
    };

    try {
        const response = await axios.post("https://api.tea-fi.com/transaction", payload, {
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
                "Referer": "https://app.tea-fi.com/"
            }
        });
        log.info("✅ Transaction Report Succesfully Sent:", response?.data);

        await getPoints(address);
        return address;
    } catch (error) {
        log.error("❌ Failed To Send Transaction Report:", error.response?.data || error.message);

        if (retries > 0) {
            log.warn(`🔃 Retrying in 3s... (${retries - 1} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            return sendTransaction(
                gasFee,
                true,
                retries - 1,
                txHash,
                address,
                amount
            );
        }

        log.error("🚨 Max retries reached. Giving up or ask them to upgrade server lol😆");
        return address;
    }
}

async function getPoints(address) {
    log.info(`🔃 Trying to check current points...`)
    try {
        const response = await axios.get(`https://api.tea-fi.com/points/${address}`, {
            headers: {
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0",
                "Origin": "https://app.tea-fi.com",
                "Referer": "https://app.tea-fi.com/"
            }
        });
        log.info("📊 Total Points:", response?.data?.pointsAmount || 0);
    } catch (error) {
        log.error("❌ Error When Checking Points:", error.response?.data || error.message);
    }
}

async function checkInStatus(address) {
    try {
        const response = await axios.get(`https://api.tea-fi.com/wallet/check-in/current?address=${address}`, {
            headers: {
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0",
                "Origin": "https://app.tea-fi.com",
                "Referer": "https://app.tea-fi.com/"
            }
        });
        log.info("📅 Last CheckIn:", response?.data?.lastCheckIn || `Never check in`);
        return response?.data?.lastCheckIn
    } catch (error) {
        log.error("❌ Failed to Check latest checkIn:", error.response?.data || error.message);
    }
}

async function checkIn(address) {
    try {
        const response = await axios.post(`https://api.tea-fi.com/wallet/check-in?address=${address}`, {}, {
            headers: {
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0",
                "Origin": "https://app.tea-fi.com",
                "Referer": "https://app.tea-fi.com/"
            }
        });
        log.info("✅ Check-In Succesfully:", response.data);
    } catch (error) {
        log.error("❌ Failed to Check-In:", error.response?.data || error.message);
    }
}

async function checkInUser(address) {
    log.info(`📢 Trying to check latest checkin user...`)
    const lastCheckIn = await checkInStatus(address);
    const lastDate = new Date(lastCheckIn).getUTCDate();
    const now = new Date().getUTCDate();
    if (lastDate !== now) {
        log.info(`🔃 Trying to checkin...`)
        await checkIn(address);
    } else {
        log.info(`✅ Already checkin today...`)
    }
}

async function runDailyTasks(maxIterations) {
    let counter = 0;
    const manualGasFee = "9000000000000000";

    while (counter < maxIterations) {
        console.clear();
        counter++;
        log.info(`=X= ================ZLKCYBER================ =X=`);
        log.info(`🔃 Processing Transaction ${counter} of ${maxIterations} (CTRL + C to exit)...\n`);

        const address = await sendTransaction(manualGasFee);
        await checkInUser(address);

        log.info(`=X= ======================================== =X=`);
        await new Promise(resolve => setTimeout(resolve, 10 * 1000));
    }

    log.info(`✅ Processing complete. Total transactions: ${counter}`);
}

(async () => {
    let runCount = 0;
    const maxIterations = 5; // Atur jumlah pengulangan per hari di sini
    const delay = 24 * 60 * 60 * 1000; // 24 jam dalam milidetik

    while (true) {
        runCount++;
        log.info(`\n🚀 Starting Run #${runCount}...\n`);
        await runDailyTasks(maxIterations);
        log.info(`\n🔃 Waiting for 24 hours before next run...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
})();
