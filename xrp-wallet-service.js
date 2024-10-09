// const RippleAPI = require('ripple-lib').RippleAPI;

// // Initialize a RippleAPI instance
// const api = new RippleAPI({
//     server: 'wss://s.altnet.rippletest.net:51233' // Testnet server
// });

// // Connect to the XRP Ledger server
// async function connect() {
//     try {
//         await api.connect();
//         console.log('Connected to XRP Ledger');
//     } catch (error) {
//         console.error('Error connecting to XRP Ledger:', error);
//     }
// }

// // Disconnect from the XRP Ledger server
// async function disconnect() {
//     try {
//         await api.disconnect();
//         console.log('Disconnected from XRP Ledger');
//     } catch (error) {
//         console.error('Error disconnecting from XRP Ledger:', error);
//     }
// }

// // Function to send XRP payment
// async function sendPayment(walletAddress, amount) {
//     try {
//         // Construct payment transaction
//         const preparedTx = await api.preparePayment(walletAddress, {
//             source: {
//                 address: process.env.XRP_SENDER_ADDRESS, // Sender's XRP address
//                 maxAmount: {
//                     value: String(amount),
//                     currency: 'XRP'
//                 }
//             },
//             destination: {
//                 address: walletAddress, // Recipient's XRP address
//                 amount: {
//                     value: String(amount),
//                     currency: 'XRP'
//                 }
//             }
//         });

//         // Sign the transaction
//         const signedTx = api.sign(preparedTx.txJSON, process.env.XRP_SENDER_SECRET); // Sender's XRP secret key

//         // Submit the transaction
//         const txResponse = await api.submit(signedTx.signedTransaction);
//         console.log('Payment transaction submitted:', txResponse);
        
//         return { success: true, txResponse };
//     } catch (error) {
//         console.error('Error sending XRP payment:', error);
//         return { success: false, error: error.message };
//     }
// }

// module.exports = { connect, disconnect, sendPayment };
