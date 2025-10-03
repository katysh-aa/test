// app.js - основной файл приложения (точка входа)
import { initializeFirebase, SecurityHelper } from './config.js';
import { transactions, savingsGoal, financialPlans, editingPlanId } from './modules/state.js';
import { db, auth, transactionsCollection, plansCollection, goalDocRef } from './modules/firebase.js';
import { initAuth, logout } from './modules/auth.js';
import { loadFromFirebase, loadGoalFromFirebase, saveGoal, startEdit, updateTransaction, deleteTransaction, cancelEdit, addTransaction } from './modules/transactions.js';
import { show, showError, showSuccess, toggleTheme, updateDropdowns, renderRecentList, renderAllList, createTransactionListItem } from './modules/ui.js';
import { updateHome, updateDollarSavings, updateAnalytics, initBI, updateBI } from './modules/analytics.js';
import { renderPlanList, startEditPlan, deletePlan, importPlanFromExcel, exportToExcel, handlePlanFormSubmit } from './modules/plans.js';
import { domElements } from './modules/dom.js';
import { getUsdRateCached, formatNumber, debounce, DEBOUNCE_DELAYS } from './modules/utils.js';

// Глобальные переменные для графиков (импортированы из state.js)
let expensePieChart = null;
let savingsWeeklyChart = null;

// Debounced функции
const renderAllListDebounced = debounce(renderAllList, DEBOUNCE_DELAYS.RENDER_LIST);
const updateUIDebounced = debounce(updateUI, DEBOUNCE_DELAYS.UI_UPDATE);

// Инициализация приложения
async function initApp() {
    try {
        // Инициализация Firebase
        await initializeFirebase();
        console.log('✅ Firebase initialized successfully');

        // Инициализация аутентификации
        initAuth();

        // Установка обработчиков событий
        setupEventListeners();

        // Инициализация темы
        initTheme();

        // Инициализация фильтров
        initFilters();

        // Глобальные экспорты для обратной совместимости с HTML
        window.transactions = transactions;
        window.savingsGoal = savingsGoal;
        window.financialPlans = financialPlans;
        window.logout = logout;
        window.show = show;
        window.toggleTheme = toggleTheme;
        window.saveGoal = saveGoal;
        window.cancelEdit = cancelEdit;
        window.importPlanFromExcel = importPlanFromExcel;
        window.exportToExcel = exportToExcel;
        window.updateBI = updateBI;
        window.initBI = initBI;

        console.log('✅ App initialized successfully');

    } catch (error) {
        console.error('❌ App initialization failed:', error);
        showError('Ошибка инициализации приложения. Пожалуйста, обновите страницу.');
    }
}

// Установка обработчиков событий
function setupEventListeners() {
    // Форма добавления транзакции
    domElements.addForm?.addEventListener('submit', handleAddTransaction);

    // Форма редактирования транзакции
    domElements.editForm?.addEventListener('submit', handleEditTransaction);

    // Форма финансового плана
    domElements.planForm?.addEventListener('submit', handlePlanFormSubmit);

    // Кнопка выхода
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Pull-to-refresh
    setupPullToRefresh();

    // События для фильтров
    domElements.filterStartInput?.addEventListener('change', renderAllListDebounced);
    domElements.filterEndInput?.addEventListener('change', renderAllListDebounced);
}

// Обработка добавления транзакции
function handleAddTransaction(e) {
    e.preventDefault();
    const form = e.target;
    
    const newTx = {
        date: form.date.value,
        category: SecurityHelper.sanitizeInput(form.category.value),
        amount: parseFloat(form.amount.value),
        type: form.type.value,
        author: SecurityHelper.sanitizeInput(form.author.value),
        comment: SecurityHelper.sanitizeInput(form.comment.value || ''),
        isDollarSavings: form['dollar-savings']?.checked || false
    };

    // Валидация данных
    const validation = SecurityHelper.validateTransaction(newTx);
    if (!validation.isValid) {
        showError('Ошибка валидации: ' + validation.errors.join(', '));
        return;
    }

    if (!newTx.date || !newTx.category || isNaN(newTx.amount) || newTx.amount <= 0 || !newTx.author) {
        showError('Заполните все обязательные поля корректно');
        return;
    }
    
    addTransaction(newTx)
        .then(() => {
            form.reset();
            domElements.dateInput.valueAsDate = new Date();
        })
        .catch(err => {
            console.error('Ошибка добавления операции:', err);
            showError('Ошибка при добавлении операции: ' + err.message);
        });
}

// Обработка редактирования транзакции
function handleEditTransaction(e) {
    e.preventDefault();
    const form = e.target;
    const id = form['edit-id'].value;
    
    const updatedTx = {
        date: form['edit-date'].value,
        category: SecurityHelper.sanitizeInput(form['edit-category'].value),
        amount: parseFloat(form['edit-amount'].value),
        type: form['edit-type'].value,
        author: SecurityHelper.sanitizeInput(form['edit-author'].value),
        comment: SecurityHelper.sanitizeInput(form['edit-comment'].value || ''),
        isDollarSavings: form['edit-dollar-savings']?.checked || false
    };

    // Валидация данных
    const validation = SecurityHelper.validateTransaction(updatedTx);
    if (!validation.isValid) {
        showError('Ошибка валидации: ' + validation.errors.join(', '));
        return;
    }

    if (!updatedTx.date || !updatedTx.category || isNaN(updatedTx.amount) || updatedTx.amount <= 0 || !updatedTx.author) {
        showError('Заполните все обязательные поля корректно');
        return;
    }
    
    updateTransaction(id, updatedTx);
}

// Инициализация темы
function initTheme() {
    const isDark = localStorage.getItem('dark-theme') === 'true';
    if (isDark) {
        document.body.classList.add('dark-theme');
    }
}

// Инициализация фильтров
function initFilters() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    if (domElements.filterStartInput) {
        domElements.filterStartInput.value = localStorage.getItem('filter-start') || startOfMonth.toISOString().split('T')[0];
    }
    
    if (domElements.filterEndInput) {
        domElements.filterEndInput.value = localStorage.getItem('filter-end') || today.toISOString().split('T')[0];
    }
}

// Настройка Pull-to-refresh
function setupPullToRefresh() {
    let startY = 0;
    let currentY = 0;
    let isPulling = false;

    document.body.addEventListener('touchstart', e => {
        if (window.scrollY === 0) {
            startY = e.touches[0].clientY;
            isPulling = true;
        }
    }, { passive: false });

    document.body.addEventListener('touchmove', e => {
        if (!isPulling) return;
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff > 0) {
            e.preventDefault();
            if (domElements.refreshIndicator) {
                domElements.refreshIndicator.style.opacity = Math.min(1, diff / 100);
            }
        }
    }, { passive: false });

    document.body.addEventListener('touchend', () => {
        if (!isPulling) return;
        isPulling = false;
        if (currentY - startY > 80) {
            if (domElements.refreshIndicator) {
                domElements.refreshIndicator.style.opacity = 1;
            }
            loadFromFirebase();
            loadGoalFromFirebase();
            setTimeout(() => {
                if (domElements.refreshIndicator) {
                    domElements.refreshIndicator.style.opacity = 0;
                }
            }, 1500);
        } else if (domElements.refreshIndicator) {
            domElements.refreshIndicator.style.opacity = 0;
        }
    });
}

// Функция обновления UI (импортирована из ui.js)
function updateUI() {
    renderRecentList();
    updateHome();
    updateDollarSavings();
    updateDropdowns();
    if (isSectionActive('analytics')) updateAnalytics();
    if (isSectionActive('list')) renderAllListDebounced();
}

// Проверка активной секции
function isSectionActive(sectionId) {
    const section = document.getElementById(sectionId);
    return section && section.style.display !== 'none';
}

// Показать индикатор загрузки
function showLoadingIndicator(show) {
    if (domElements.refreshIndicator) {
        domElements.refreshIndicator.style.opacity = show ? '1' : '0';
    }
}

// Запуск приложения при загрузке DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Экспорт для тестирования
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initApp };
}
