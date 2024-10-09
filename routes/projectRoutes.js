const express = require('express');
const router = express.Router();
const xrpl = require('xrpl');
const { Wallet } = require('xrpl');
const shortid = require('shortid');
const multer = require('multer');
const mongoose = require('mongoose');

const storage = multer.memoryStorage();

const upload = multer({
    storage: storage
});

const client = new xrpl.Client('wss://s.altnet.rippletest.net:51233/', {
    connectionTimeout: 1000000
});

const projectSchema = new mongoose.Schema({
    projectId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    targetAmount: { type: Number, required: true },
    creatorWalletAddress: { type: String, required: true },
    image: { type: Buffer, required: true },
    status: { type: String, enum: ['Pending', 'Active', 'Completed', 'Ended', 'Rejected'], default: 'Pending' },
    createdAt: { type: Date, default: Date.now },
    endDate: { type: Date, required: true }, // Adding end date
    updatedAt: { type: Date, default: Date.now },
    duration: { type: Number }
});

// projectSchema.methods.toJSON = function() {
//     const project = this;
//     const projectObject = project.toObject();

//     // Convert the image buffer to a base64 string
//     projectObject.image = project.image.toString('base64');

//     return projectObject;
// };

projectSchema.pre('save', function (next) {
    // Calculate duration in milliseconds
    const durationMs = this.endDate.getTime() - this.createdAt.getTime();
    // Convert duration from milliseconds to days and set it to duration property
    this.duration = durationMs / (1000 * 3600 * 24);
    next();
});

const Project = mongoose.model('Project', projectSchema);

const transactionSchema = new mongoose.Schema({
    transactionId: { type: String, required: true },  // The transaction hash from XRPL
    ledgerIndex: { type: Number, required: true },     // The ledger index from XRPL
    sender: { type: String, required: true },          // Sender's wallet address
    receiver: { type: String, required: true },        // Receiver's wallet address
    amount: { type: Number, required: true },          // Amount sent in XRP
    timestamp: { type: Date, default: Date.now },      // Timestamp of the transaction
    projectId: { type: String, required: true }        // Associated project ID
});

const Transactiondb = mongoose.model('Transaction', transactionSchema);

router.get('/total-raised', async (req, res) => {
    try {
        // Aggregate the total amount raised from all transactions
        const totalRaised = await Transactiondb.aggregate([
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);

        // If the totalRaised array is empty, set the totalAmount to 0
        const totalAmount = totalRaised.length > 0 ? totalRaised[0].totalAmount : 0;

        res.status(200).json({ totalRaised: totalAmount });
    } catch (error) {
        console.error('Error calculating total raised amount:', error);
        res.status(500).json({ error: 'Error calculating total raised amount' });
    }
});

router.get('/project-stats', async (req, res) => {
    try {
        // Calculate the total number of projects
        const totalProjects = await Project.countDocuments();

        // Calculate the total number of active projects
        const activeProjects = await Project.countDocuments({ status: 'Active' });

        // Calculate the total number of completed projects
        const completedProjects = await Project.countDocuments({ status: 'Completed' });

        // Calculate the total number of ended projects
        const endedProjects = await Project.countDocuments({ status: 'Ended' });

        res.status(200).json({
            totalProjects,
            activeProjects,
            completedProjects,
            endedProjects
        });
    } catch (error) {
        console.error('Error retrieving project stats:', error);
        res.status(500).json({ error: 'Error retrieving project stats' });
    }
});

router.post('/create-project', upload.single('image'), async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.walletAddress) {
            return res.status(401).json({ error: 'User is not logged in' });
        }

        if (req.session.user.userType !== 'creator') {
            return res.status(403).json({ error: 'User is not authorized to create projects' });
        }

        const { title, description, targetAmount, endDate } = req.body;

        if (!endDate || isNaN(Date.parse(endDate))) {
            return res.status(400).json({ error: 'Invalid end date format. Please provide a valid ISO date string.' });
        }

        const creatorWalletAddress = req.session.user.walletAddress;
        const projectId = shortid.generate();

        const project = new Project({
            projectId,
            title,
            description,
            targetAmount,
            endDate,
            image: req.file.buffer,
            creatorWalletAddress
        });

        project.duration = (new Date(endDate).getTime() - project.createdAt.getTime()) / (1000 * 3600 * 24); // Duration in days

        await project.save();

        res.status(201).json({ message: 'Project created successfully, pending approval', project });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating Project' });
    }
});

router.put('/projects/:projectId/approve', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.userType !== 'admin') {
            return res.status(403).json({ error: 'User is not authorized to approve projects' });
        }

        const { projectId } = req.params;
        const project = await Project.findOne({ projectId });

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        if (project.status !== 'Pending') {
            return res.status(400).json({ error: 'Project is not pending approval' });
        }

        project.status = 'Active';
        await project.save();

        // Create notification for project creator
        const notification = new Notification({
            userId: project.creatorWalletAddress,
            message: `Your project "${project.title}" has been approved and is now active.`
        });
        await notification.save();

        res.status(200).json({ message: 'Project approved successfully', project });
    } catch (error) {
        console.error('Error approving project:', error);
        res.status(500).json({ error: 'Error approving project' });
    }
});

router.put('/projects/:projectId/reject', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.userType !== 'admin') {
            return res.status(403).json({ error: 'User is not authorized to reject projects' });
        }

        const { projectId } = req.params;
        const project = await Project.findOne({ projectId });

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        if (project.status !== 'Pending') {
            return res.status(400).json({ error: 'Only projects that are pending can be rejected' });
        }

        project.status = 'Rejected';
        await project.save();

        // Create notification for project creator
        const notification = new Notification({
            userId: project.creatorWalletAddress,
            message: `Your project "${project.title}" has been rejected.`
        });
        await notification.save();

        res.status(200).json({ message: 'Project rejected successfully', project });
    } catch (error) {
        console.error('Error rejecting project:', error);
        res.status(500).json({ error: 'Error rejecting project' });
    }
});

router.put('/projects/:projectId/mark-completed', async (req, res) => {
    try {
        const { projectId } = req.params;
        const project = await Project.findOne({ projectId });

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const transactions = await Transactiondb.find({ projectId });
        const totalRaised = transactions.reduce((total, transaction) => total + transaction.amount, 0);

        if (totalRaised >= project.targetAmount) {
            project.status = 'Completed';
            await project.save();

            // Create notification for project creator
            const notification = new Notification({
                userId: project.creatorWalletAddress,
                message: `Your project "${project.title}" has been marked as completed.`
            });
            await notification.save();

            return res.status(200).json({ message: 'Project marked as completed' });
        } else {
            return res.status(400).json({ error: 'Project goal not reached yet' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error marking Project as completed' });
    }
});

router.post('/invest', async (req, res) => {
    try {
        // Check if user is logged in (i.e., if session exists)
        if (!req.session.user || !req.session.user.walletAddress) {
            return res.status(401).json({ error: 'User is not logged in' });
        }

        // Check if user is an investor
        if (req.session.user.userType !== 'investor') {
            return res.status(403).json({ error: 'User is not authorized to donate!' });
        }

        const { walletSecret, amount, projectId } = req.body;
        const { walletAddress } = req.session.user;

        // Validate wallet secret
        const secretValidationResult = await validateWalletSecret(walletAddress, walletSecret);

        if (secretValidationResult !== true) {
            return res.status(400).send(secretValidationResult);
        }

        // Find the Project in the database based on the ProjectId
        const project = await Project.findOne({ projectId });

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Check if the Project status is "completed" or "ended"
        if (project.status === 'Completed') {
            return res.status(400).json({ error: 'Project is already completed. Further donations are not allowed.' });
        }

        if (project.status === 'Ended') {
            return res.status(400).json({ error: 'Project is already ended by creator. Further donations are not allowed.' });
        }

        // Extract the destination address from the Project
        const destination = project.creatorWalletAddress;

        // Check if the sender is the same as the Project creator
        if (walletAddress === destination) {
            return res.status(400).json({ error: "You can't donate to your own Project" });
        }

        // Connect to the XRPL
        await client.connect();

        // Fetch the wallet balance
        const accountInfo = await client.request({
            command: 'account_info',
            account: walletAddress
        });

        const balance = accountInfo.result.account_data.Balance;
        const xrpBalance = parseFloat(balance) / 1000000;

        // Check if the balance is less than the input amount
        if (xrpBalance < amount) {
            await client.disconnect();
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Initialize the wallet using the secret
        const wallet = xrpl.Wallet.fromSecret(walletSecret);

        // Prepare the transaction
        const prepared = await client.autofill({
            "TransactionType": "Payment",
            "Account": walletAddress,
            "Amount": xrpl.xrpToDrops(amount.toString()),
            "Destination": destination,
        });
        console.log(prepared);

        // Sign the prepared transaction
        const signed = wallet.sign(prepared);

        // Submit the transaction and wait for the results
        const tx = await client.submitAndWait(signed.tx_blob);

        // Request balance changes caused by the transaction
        const balanceChanges = xrpl.getBalanceChanges(tx.result.meta);

        // Disconnect from the XRPL
        await client.disconnect();

        // Store transaction details in the database, including ledgerIndex and transactionId
        const transaction = new Transactiondb({
            transactionId: tx.result.hash, // Transaction hash (ID)
            ledgerIndex: tx.result.ledger_index, // Ledger index
            sender: walletAddress,
            receiver: destination,
            amount: amount,
            projectId: projectId  // Include the ProjectId associated with this transaction
        });
        await transaction.save();

        // Create a notification for the investor about their investment
        const investorNotification = new Notification({
            userId: walletAddress, // Investor's wallet address
            message: `You have invested ${amount} XRP to project "${project.title}".`
        });
        await investorNotification.save();

        // Create a notification for the project creator about the new investment
        const creatorNotification = new Notification({
            userId: destination, // Project creator's wallet address
            message: `Your project "${project.title}" received an investment of ${amount} XRP from ${walletAddress}.`
        });
        await creatorNotification.save();

        // Check if the Project goal is reached
        const transactions = await Transactiondb.find({ projectId });
        const totalRaised = transactions.reduce((total, transaction) => {
            return total + transaction.amount;
        }, 0);

        if (totalRaised >= project.targetAmount) {
            // Update the Project status to "completed"
            project.status = 'Completed';
            await project.save();

            // Create a notification for the project creator about the project completion
            const completionNotification = new Notification({
                userId: destination, // Project creator's wallet address
                message: `Congratulations! Your project "${project.title}" has reached its target amount and is now completed.`
            });
            await completionNotification.save();
        }

        // Respond with success message and balance changes
        res.json({ success: true, transactionId: tx.result.hash, ledgerIndex: tx.result.ledger_index, balanceChanges });
    } catch (error) {
        console.error("Error sending XRP:", error);
        res.status(500).json({ success: false, error });
    }
});


router.get('/projects/all', async (req, res) => {
    try {
        // Retrieve all Projects from MongoDB
        const projects = await Project.find();

        // Send the Projects as a JSON response
        res.status(200).json(projects);
    } catch (error) {
        // If an error occurs, send a 500 status code with an error message
        console.error(error);
        res.status(500).json({ error: 'Error retrieving Projects' });
    }
});

router.get('/projects/exclude-rejected-pending', async (req, res) => {
    try {
        // Find all projects where the status is not "Rejected" and not "Pending"
        const projects = await Project.find({ status: { $nin: ['Rejected', 'Pending'] } });

        // If no projects are found
        if (projects.length === 0) {
            return res.status(404).json({ message: 'No projects found' });
        }

        // Return the list of projects
        res.status(200).json(projects);
    } catch (error) {
        console.error('Error retrieving projects:', error);
        res.status(500).json({ error: 'Error retrieving projects' });
    }
});


// Route to delete a project
router.delete('/projects/:projectId', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.userType !== 'admin') {
            return res.status(403).json({ error: 'User is not authorized to delete projects' });
        }

        const { projectId } = req.params;
        const project = await Project.findOne({ projectId });

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        await Project.deleteOne({ projectId });
        await Transactiondb.deleteMany({ projectId });

        // Create notification for project creator
        const notification = new Notification({
            userId: project.creatorWalletAddress,
            message: `Your project "${project.title}" has been deleted by the admin.`
        });
        await notification.save();

        res.status(200).json({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ error: 'Error deleting project' });
    }
});

router.get('/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const project = await Project.findOne({ projectId });

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.status(200).json(project);
    } catch (error) {
        console.error('Error fetching project details:', error);
        res.status(500).json({ error: 'Error fetching project details' });
    }
});

router.get('/projects/:projectId/transactions', async (req, res) => {
    try {
        const { projectId } = req.params;

        // Find the Project in the database based on the ProjectId
        const project = await Project.findOne({ projectId });

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Find all transactions associated with the Project
        const transactions = await Transactiondb.find({ projectId });

        res.status(200).json(transactions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error retrieving transactions' });
    }
});

router.get('/myprojects', async (req, res) => {
    try {
        // Retrieve the wallet address of the current user from the session
        const { walletAddress } = req.session.user;

        // Find all Projects created by the current user
        const projects = await Project.find({ creatorWalletAddress: walletAddress });

        res.status(200).json(projects);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error retrieving Projects' });
    }
});

router.get('/projects/:projectId/raised', async (req, res) => {
    try {
        const { projectId } = req.params;

        // Find the Project in the database based on the ProjectId
        const project = await Project.findOne({ projectId });

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Find all transactions associated with the Project
        const transactions = await Transactiondb.find({ projectId });

        // Calculate the total amount raised
        const totalRaised = transactions.reduce((total, transaction) => {
            return total + transaction.amount;
        }, 0);

        res.status(200).json({ projectId, totalRaised });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error retrieving raised amount for the Project' });
    }
});

router.get('/other-projects', async (req, res) => {
    try {
        // Check if user is logged in (i.e., if session exists)
        if (!req.session.user || !req.session.user.walletAddress) {
            return res.status(401).json({ error: 'User is not logged in' });
        }

        // Retrieve the wallet address of the current user from the session
        const walletAddress = req.session.user.walletAddress;

        // Find all projects not created by the current user
        const otherProjects = await Project.find({ creatorWalletAddress: { $ne: walletAddress } });

        // Send the projects as a JSON response
        res.status(200).json(otherProjects);
    } catch (error) {
        console.error('Error retrieving other projects:', error);
        res.status(500).json({ error: 'Error retrieving other projects' });
    }
});

router.put('/projects/:projectId/mark-ended', async (req, res) => {
    try {
        // Check if user is logged in (i.e., if session exists)
        if (!req.session.user || !req.session.user.walletAddress) {
            return res.status(401).json({ error: 'User is not logged in' });
        }

        // Retrieve the project ID from the request parameters
        const { projectId } = req.params;

        // Find the project in the database
        const project = await Project.findOne({ projectId });

        // Check if the project exists
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Check if the current user is the owner of the project
        if (project.creatorWalletAddress !== req.session.user.walletAddress) {
            return res.status(403).json({ error: 'Only the project owner can mark the project as ended' });
        }

        // Mark the project as ended
        project.status = 'Ended';
        await project.save();

        // Create a notification for the project owner
        const notification = new Notification({
            userId: project.creatorWalletAddress,
            message: `Your project "${project.title}" has been marked as ended.`
        });
        await notification.save();

        res.status(200).json({ message: 'Project marked as ended successfully' });
    } catch (error) {
        console.error('Error marking project as ended:', error);
        res.status(500).json({ error: 'Error marking project as ended' });
    }
});

router.put('/mark-ended', async (req, res) => {
    try {
        // Find all active projects where the end date is in the past
        const expiredProjects = await Project.find({ status: 'Active', endDate: { $lt: new Date() } });

        // Mark each expired project as "Ended"
        await Promise.all(expiredProjects.map(async project => {
            project.status = 'Ended';
            await project.save();
        }));

        res.json({ message: 'Projects marked as ended successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error marking projects as ended' });
    }
});

router.get('/completed-projects', async (req, res) => {
    try {
        // Find all Projects with status "completed" from MongoDB
        const completedProjects = await Project.find({ status: 'Completed' });

        // Send the completed Projects as a JSON response
        res.status(200).json(completedProjects);
    } catch (error) {
        // If an error occurs, send a 500 status code with an error message
        console.error(error);
        res.status(500).json({ error: 'Error retrieving completed Projects' });
    }
});

router.get('/active-projects', async (req, res) => {
    try {
        // Find all Projects with status "active" from MongoDB
        const activeProjects = await Project.find({ status: 'Active' });

        // Send the active Projects as a JSON response
        res.status(200).json(activeProjects);
    } catch (error) {
        // If an error occurs, send a 500 status code with an error message
        console.error(error);
        res.status(500).json({ error: 'Error retrieving active Projects' });
    }
});

router.get('/ended-projects', async (req, res) => {
    try {
        // Find all projects with status set to "Ended"
        const endedProjects = await Project.find({ status: 'Ended' });

        // If no projects are found
        if (endedProjects.length === 0) {
            return res.status(404).json({ message: 'No ended projects found' });
        }

        // Return the list of ended projects
        res.json(endedProjects);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error retrieving ended projects' });
    }
});

// Route to fetch wallet balance
router.get('/wallet-balance', async (req, res) => {
    try {
        // Get wallet address from session
        const walletAddress = req.session.user.walletAddress;

        // Connect to XRPL
        await client.connect();

        // Get account info to fetch the balance
        const accountInfo = await client.request({
            command: 'account_info',
            account: walletAddress
        });

        // Close the connection to XRPL
        await client.disconnect();

        // Check if account info is retrieved successfully and has balance property
        if (accountInfo && accountInfo.result && accountInfo.result.account_data && accountInfo.result.account_data.Balance) {
            const balance = accountInfo.result.account_data.Balance;
            // Convert balance from drops to XRP (1 XRP = 1,000,000 drops)
            const xrpBalance = parseFloat(balance) / 1000000;
            res.json({ success: true, balance: xrpBalance });
        } else {
            console.error('Failed to retrieve wallet balance:', accountInfo);
            res.status(500).json({ success: false, error: 'Failed to fetch wallet balance' });
        }
    } catch (error) {
        console.error('Error fetching wallet balance:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch wallet balance' });
    }
});

async function validateWalletSecret(walletAddress, walletSecret) {
    try {
        // Check if the walletSecret is a string
        if (typeof walletSecret !== 'string') {
            return 'Wallet secret should be a string.';
        }

        // Create a new wallet object from the provided wallet secret
        const wallet = Wallet.fromSeed(walletSecret);

        // Get the wallet address derived from the provided wallet secret
        const secretAddress = wallet.address;

        // Compare the provided wallet address and the wallet address derived from the wallet secret
        if (secretAddress === walletAddress) {
            return true; // Authentication successful
        } else {
            return 'Invalid wallet secret.'; // Authentication failed
        }
    } catch (error) {
        console.error(error);
        return 'Error validating wallet secret.'; // Error occurred during validation
    }
}

router.get('/my-transactions', async (req, res) => {
    try {
        // Check if user is logged in (i.e., if session exists)
        if (!req.session.user || !req.session.user.walletAddress) {
            return res.status(401).json({ error: 'User is not logged in' });
        }

        // Retrieve the wallet address of the current user from the session
        const { walletAddress } = req.session.user;

        // Find all transactions where the user is either the sender or the receiver
        const transactions = await Transactiondb.find({
            $or: [
                { sender: walletAddress },
                { receiver: walletAddress }
            ]
        });

        if (transactions.length === 0) {
            return res.status(404).json({ message: 'No transactions found for the current user' });
        }

        // Find all project IDs from the transactions
        const projectIds = transactions.map(transaction => transaction.projectId);

        // Find project details for the retrieved project IDs
        const projects = await Project.find({ projectId: { $in: projectIds } });

        // Create a map of projectId to project details
        const projectMap = {};
        projects.forEach(project => {
            projectMap[project.projectId] = project;
        });

        // Add project details to each transaction
        const transactionsWithProjects = transactions.map(transaction => {
            const project = projectMap[transaction.projectId] || {};
            return {
                ...transaction.toObject(),
                project
            };
        });

        // Send the transactions with project details as a JSON response
        res.status(200).json(transactionsWithProjects);
    } catch (error) {
        console.error('Error retrieving user transactions:', error);
        res.status(500).json({ error: 'Error retrieving user transactions' });
    }
});


const notificationSchema = new mongoose.Schema({
    userId: { type: String, required: true },  // Changed to String for simplicity
    message: { type: String, required: true },
    date: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', notificationSchema);

router.post('/notifications', async (req, res) => {
    try {
        const { userId, message } = req.body;

        // Validate input
        if (!userId || !message) {
            return res.status(400).json({ error: 'User ID and message are required' });
        }

        // Create a new notification
        const notification = new Notification({
            userId,
            message
        });

        // Save the notification to the database
        await notification.save();

        res.status(201).json({ message: 'Notification created successfully', notification });
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({ error: 'Error creating notification' });
    }
});

router.get('/notifications', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'User is not logged in' });
        }

        const userId = req.session.user.walletAddress;
        const notifications = await Notification.find({ userId });

        res.status(200).json(notifications);
    } catch (error) {
        console.error('Error retrieving notifications:', error);
        res.status(500).json({ error: 'Error retrieving notifications' });
    }
});

// Endpoint to mark notifications as read
router.post('/notifications/markAsRead', async (req, res) => {
    try {
        const { notifications } = req.body;
        await Notification.updateMany(
            { _id: { $in: notifications } },
            { $set: { isRead: true } }
        );
        res.status(200).send('Notifications marked as read');
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        res.status(500).send('Internal Server Error');
    }
});


module.exports = router;
