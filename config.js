// Firebase Configuration

const firebaseConfig = {
    apiKey: "AIzaSyCw3MkLyY_3wL5lPFZP3RN3pNNL_5MXfCQ",
    authDomain: "budget-d7b61.firebaseapp.com",
    projectId: "budget-d7b61",
    storageBucket: "budget-d7b61.firebasestorage.app",
    messagingSenderId: "853003887380",
    appId: "1:853003887380:web:5aa5fda151ff9823c9d801",
    measurementId: "G-0JZTCC3MLW"
};

// Environment validation
function validateFirebaseConfig() {
    const required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    const missing = required.filter(key => !firebaseConfig[key] || firebaseConfig[key].trim() === '');
    
    if (missing.length > 0) {
        console.error('❌ Missing required Firebase config keys:', missing);
        return false;
    }
    
    // Security warnings
    if (firebaseConfig.apiKey.includes('AIzaSy')) {
        console.warn('⚠️ Firebase API key exposed. In production, use environment variables or Firebase App Check.');
    }
    
    if (!firebaseConfig.projectId) {
        console.error('❌ Firebase projectId is required');
        return false;
    }
    
    console.log('✅ Firebase configuration validated successfully');
    return true;
}

// Initialize Firebase with error handling
function initializeFirebase() {
    if (!validateFirebaseConfig()) {
        throw new Error('Invalid Firebase configuration. Please check your config.js file.');
    }
    
    try {
        // Check if Firebase is already initialized
        if (firebase.apps.length > 0) {
            console.log('ℹ️ Firebase already initialized, using existing instance');
            return firebase.app();
        }
        
        const app = firebase.initializeApp(firebaseConfig);
        console.log('✅ Firebase initialized successfully');
        
        // Initialize services
        const db = firebase.firestore();
        const auth = firebase.auth();
        
        // Firebase services configuration
        const firebaseServices = {
            db: db,
            auth: auth,
            transactionsCollection: db.collection('transactions'),
            plansCollection: db.collection('financial-plans'),
            goalDocRef: db.collection('settings').doc('goal'),
            app: app
        };
        
        // Enable offline persistence for Firestore
        db.enablePersistence()
            .then(() => {
                console.log('✅ Firestore offline persistence enabled');
            })
            .catch(err => {
                if (err.code === 'failed-precondition') {
                    console.warn('⚠️ Firestore offline persistence failed: Multiple tabs open');
                } else if (err.code === 'unimplemented') {
                    console.warn('⚠️ Firestore offline persistence not supported by browser');
                } else {
                    console.error('❌ Firestore offline persistence error:', err);
                }
            });
        
        return firebaseServices;
        
    } catch (error) {
        console.error('❌ Firebase initialization failed:', error);
        
        // Provide helpful error messages
        if (error.code === 'app/duplicate-app') {
            throw new Error('Firebase app already initialized');
        } else if (error.code === 'app/invalid-app-argument') {
            throw new Error('Invalid Firebase configuration');
        } else {
            throw new Error(`Firebase initialization failed: ${error.message}`);
        }
    }
}

// Security validation helpers
const SecurityHelper = {
    // Sanitize user input to prevent XSS
    sanitizeInput: function(input) {
        if (typeof input !== 'string') return input;
        
        // Remove potentially dangerous characters
        return input
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;')
            .replace(/\\/g, '&#x5C;')
            .replace(/`/g, '&#x60;');
    },
    
    // Validate transaction data before saving to Firebase
    validateTransaction: function(transaction) {
        const errors = [];
        
        // Date validation
        if (!transaction.date || !/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) {
            errors.push('Invalid date format (YYYY-MM-DD required)');
        }
        
        // Category validation
        if (!transaction.category || transaction.category.trim() === '') {
            errors.push('Category is required');
        } else if (transaction.category.length > 50) {
            errors.push('Category too long (max 50 characters)');
        }
        
        // Amount validation
        if (typeof transaction.amount !== 'number' || transaction.amount <= 0) {
            errors.push('Amount must be a positive number');
        } else if (transaction.amount > 1000000000) { // 1 billion
            errors.push('Amount too large');
        }
        
        // Type validation
        if (!['income', 'expense'].includes(transaction.type)) {
            errors.push('Invalid transaction type');
        }
        
        // Author validation
        if (!transaction.author || transaction.author.trim() === '') {
            errors.push('Author is required');
        } else if (transaction.author.length > 30) {
            errors.push('Author name too long (max 30 characters)');
        }
        
        // Comment validation
        if (transaction.comment && transaction.comment.length > 200) {
            errors.push('Comment too long (max 200 characters)');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    },
    
    // Validate financial plan data
    validateFinancialPlan: function(plan) {
        const errors = [];
        
        // Month validation
        if (!plan.month || !/^\d{4}-\d{2}$/.test(plan.month)) {
            errors.push('Invalid month format (YYYY-MM required)');
        }
        
        // Income validation
        if (typeof plan.income !== 'number' || plan.income < 0) {
            errors.push('Income must be a non-negative number');
        }
        
        // Expense validation
        if (typeof plan.expense !== 'number' || plan.expense < 0) {
            errors.push('Expense must be a non-negative number');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
};

// Configuration for the application
const AppConfig = {
    // USD rate cache duration (24 hours in milliseconds)
    USD_CACHE_DURATION: 24 * 60 * 60 * 1000,
    
    // Maximum file size for Excel import (5MB)
    MAX_FILE_SIZE: 5 * 1024 * 1024,
    
    // Maximum rows for Excel import
    MAX_EXCEL_ROWS: 1000,
    
    // Debounce delays for various operations
    DEBOUNCE_DELAYS: {
        UI_UPDATE: 100,
        RENDER_LIST: 300,
        SEARCH: 500
    },
    
    // Firebase security rules (for reference)
    FIRESTORE_RULES: `
        // These should be set in Firebase Console > Firestore > Rules
        rules_version = '2';
        service cloud.firestore {
            match /databases/{database}/documents {
                // Users can only access their own data
                match /{document=**} {
                    allow read, write: if request.auth != null 
                        && request.auth.uid != null
                        && resource.data.userId == request.auth.uid;
                }
            }
        }
    `
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        firebaseConfig, 
        initializeFirebase, 
        SecurityHelper, 
        AppConfig 
    };
}
