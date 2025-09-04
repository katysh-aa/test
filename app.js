// === 1. Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDnyp4wQDFgr3OFylpZhnyn2j1Pu4i8bLs",
    authDomain: "bank-916f4.firebaseapp.com",
    databaseURL: "https://bank-916f4-default-rtdb.firebaseio.com",
    projectId: "bank-916f4",
    storageBucket: "bank-916f4.firebasestorage.app",
    messagingSenderId: "394968475663",
    appId: "1:394968475663:web:1c01d44fbf408fbaf6db7a",
    measurementId: "G-GW6MMP2L21"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// === 2. Глобальные переменные
let transactions = [];
let expensePieChart = null;
let incomePieChart = null;
let editingTransactionId = null;
let filterTimeout = null;
let DOM = {};

// === 3. Кеширование DOM-элементов (удалены элементы budgets)
function cacheDOM() {
    DOM = {
        // Основные
        currentBalance: document.getElementById('current-balance'),
        totalIncome: document.getElementById('total-income'),
        totalExpense: document.getElementById('total-expense'),
        daysUntilPayday: document.getElementById('days-until-payday'),
        dailyBudget: document.getElementById('daily-budget'),
        nextPayday: document.getElementById('next-payday'),
        progressText: document.getElementById('progress-text'),
        // История
        allTransactions: document.getElementById('all-transactions'),
        filterStart: document.getElementById('filter-start'),
        filterEnd: document.getElementById('filter-end'),
        // Анализ
        topExpenses: document.getElementById('top-expenses'),
        expensePieChart: document.getElementById('expensePieChart'),
        incomePieChart: document.getElementById('incomePieChart'),
        // Форма добавления
        addForm: document.getElementById('add-form'),
        addTitle: document.getElementById('add-title'),
        type: document.getElementById('type'),
        date: document.getElementById('date'),
        expenseCategory: document.getElementById('expense-category'),
        incomeCategory: document.getElementById('income-category'),
        amount: document.getElementById('amount'),
        comment: document.getElementById('comment'),
        expenseField: document.getElementById('expense-field'),
        incomeField: document.getElementById('income-field'),
        deleteBtn: document.getElementById('delete-btn'),
        recentTransactions: document.getElementById('recent-transactions'),
        // Уведомления
        notificationTimeInput: document.getElementById('notification-time'),
        // Навигация
        currentSectionTitle: document.getElementById('current-section-title'),
        navBtns: document.querySelectorAll('.nav-btn'),
    };
}

// === 4. Форматирование чисел
function formatNumber(num) {
    if (isNaN(num) || num === null) return "0";
    return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// === 5. Коллекции Firebase (с проверкой)
function userTransactions() {
    if (!auth.currentUser) {
        console.warn("❌ userTransactions(): пользователь не авторизован");
        return null;
    }
    return db.collection('users').doc(auth.currentUser.uid).collection('transactions');
}

// === 6. Загрузка данных с реактивностью (без budgets)
function loadFromFirebase() {
    if (!auth.currentUser) {
        console.warn("❌ loadFromFirebase(): вызов без авторизации");
        return;
    }
    const q = userTransactions();
    if (!q) return;
    q.orderBy('date', 'desc').onSnapshot((snapshot) => {
        transactions = [];
        snapshot.forEach(doc => {
            transactions.push({ id: doc.id, ...doc.data() });
        });
        updateHome();
        updateAnalytics();
        if (DOM.allTransactions && !DOM.allTransactions.closest('.hidden')) {
            renderAllList();
        }
        updateDatalists();
        renderRecentTransactions();
    }, error => {
        console.error("Ошибка загрузки транзакций:", error);
        if (error.code === 'permission-denied') {
            alert('Нет доступа к данным. Проверьте правила Firebase.');
        }
    });
}

// === 7. Вспомогательная: последний рабочий день перед датой
function getLastWorkdayBefore(day, month, year) {
    const date = new Date(year, month, day);
    while (date.getDay() === 0 || date.getDay() === 6) {
        date.setDate(date.getDate() - 1);
    }
    return new Date(date);
}

// === 8. Определение следующей зарплаты и периода
function getCurrentBudgetPeriodAndNextPayday() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const nextMonth = (currentMonth + 1) % 12;
    const year = today.getFullYear();
    const nextYear = currentMonth + 1 > 11 ? year + 1 : year;
    const payday20 = new Date(year, currentMonth, 20);
    const actualPayday20 = payday20.getDay() === 0 || payday20.getDay() === 6
        ? getLastWorkdayBefore(20, currentMonth, year)
        : payday20;
    const payday5 = new Date(nextYear, nextMonth, 5);
    const actualPayday5 = payday5.getDay() === 0 || payday5.getDay() === 6
        ? getLastWorkdayBefore(5, nextMonth, nextYear)
        : payday5;
    let nextPayday, prevPayday;
    const prev5 = new Date(year, currentMonth, 5);
    const actualPrev5 = prev5.getDay() === 0 || prev5.getDay() === 6
        ? getLastWorkdayBefore(5, currentMonth, year)
        : prev5;
    if (today <= actualPrev5) {
        nextPayday = actualPrev5;
        prevPayday = getLastWorkdayBefore(20, (currentMonth - 1 + 12) % 12, currentMonth === 0 ? year - 1 : year);
    } else if (today <= actualPayday20) {
        nextPayday = actualPayday20;
        prevPayday = actualPrev5;
    } else {
        nextPayday = actualPayday5;
        prevPayday = actualPayday20;
    }
    const periodStart = new Date(prevPayday);
    periodStart.setDate(periodStart.getDate() + 1);
    return { nextPayday, periodStart };
}

// === 9. Обновление главной
function updateHome() {
    const { nextPayday, periodStart } = getCurrentBudgetPeriodAndNextPayday();
    const startStr = periodStart.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    const currentPeriodTransactions = transactions.filter(t => t.date >= startStr && t.date <= todayStr);
    const income = currentPeriodTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
    const expense = currentPeriodTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
    const balance = income - expense;
    const daysUntil = Math.max(1, Math.ceil((nextPayday - new Date()) / (1000 * 60 * 60 * 24)));
    const dailyBudget = balance / daysUntil;

    if (DOM.currentBalance) DOM.currentBalance.textContent = formatNumber(balance) + ' ₽';
    if (DOM.dailyBudget) DOM.dailyBudget.textContent = formatNumber(dailyBudget) + ' ₽';
    if (DOM.daysUntilPayday) DOM.daysUntilPayday.textContent = daysUntil + ' дней';
    if (DOM.nextPayday) DOM.nextPayday.textContent = nextPayday.toLocaleDateString('ru-RU');
}

// === 10. Отображение истории
function renderAllList() {
    if (!DOM.allTransactions) return;
    DOM.allTransactions.innerHTML = '';
    const start = DOM.filterStart?.value;
    const end = DOM.filterEnd?.value;
    let filtered = [...transactions];
    if (start) filtered = filtered.filter(t => t.date >= start);
    if (end) filtered = filtered.filter(t => t.date <= end);
    if (filtered.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Нет операций за период';
        li.style.color = '#999';
        DOM.allTransactions.appendChild(li);
        return;
    }
    filtered.forEach(tx => {
        const li = document.createElement('li');
        const amountColor = tx.type === 'income' ? '#34c759' : '#ff3b30';
        const sign = tx.type === 'income' ? '+' : '-';
        const comment = tx.comment ? `
            <div class="info">
                <img src="comment.png" class="info-icon"> ${tx.comment}
            </div>` : '';
        const detail = tx.type === 'income' && tx.incomeCategory
            ? `<div class="info"><img src="category.png" class="info-icon"> ${tx.incomeCategory}</div>`
            : (tx.expenseCategory
                ? `<div class="info"><img src="category.png" class="info-icon"> ${tx.expenseCategory}</div>`
                : '');
        const typeIcon = tx.type === 'income'
            ? '<img src="income.png" class="type-icon">'
            : '<img src="expense.png" class="type-icon">';
        const category = tx.type === 'income' ? tx.incomeCategory : tx.expenseCategory;
        li.innerHTML = `
            <div>
                <div>
                    ${typeIcon} <strong>${category}</strong> 
                    <span style="color: ${amountColor}; font-weight: bold;">${sign}${formatNumber(tx.amount)} ₽</span>
                </div>
                <div class="info">${tx.date}</div>
                ${detail}
                ${comment}
            </div>
            <div class="actions">
                <button class="btn small" onclick="editTransaction('${tx.id}')">
                    <img src="edit.png" class="action-icon">
                </button>
                <button class="btn small danger" onclick="deleteTransaction('${tx.id}')">
                    <img src="delete.png" class="action-icon">
                </button>
            </div>
        `;
        li.style.cursor = 'default';
        DOM.allTransactions.appendChild(li);
    });
}

// === 11. Фильтры с дебаунсом
function filterByDate() {
    const start = DOM.filterStart?.value;
    const end = DOM.filterEnd?.value;
    if (start && end && start > end) {
        alert('Дата начала не может быть позже даты окончания');
        return;
    }
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(renderAllList, 300);
}

function clearFilter() {
    if (DOM.filterStart) DOM.filterStart.value = '';
    if (DOM.filterEnd) DOM.filterEnd.value = '';
    renderAllList();
}

// === 12. Анализ: диаграммы и отчёт
function updateAnalytics() {
    const { periodStart } = getCurrentBudgetPeriodAndNextPayday();
    const startStr = periodStart.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    const currentPeriodTransactions = transactions.filter(t => t.date >= startStr && t.date <= todayStr);
    const totalIncome = currentPeriodTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = currentPeriodTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

    if (DOM.totalIncome) DOM.totalIncome.textContent = formatNumber(totalIncome) + ' ₽';
    if (DOM.totalExpense) DOM.totalExpense.textContent = formatNumber(totalExpense) + ' ₽';

    // Расходы по категориям
    const expensesByCategory = {};
    currentPeriodTransactions
        .filter(t => t.type === 'expense')
        .forEach(t => {
            expensesByCategory[t.expenseCategory] = (expensesByCategory[t.expenseCategory] || 0) + t.amount;
        });

    // Топ-3 расхода
    if (DOM.topExpenses) {
        DOM.topExpenses.innerHTML = '';
        Object.entries(expensesByCategory)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .forEach(([cat, amt]) => {
                const li = document.createElement('li');
                li.textContent = `${cat}: ${formatNumber(amt)} ₽`;
                DOM.topExpenses.appendChild(li);
            });
    }

    // Диаграмма расходов
    if (DOM.expensePieChart) {
        if (expensePieChart) expensePieChart.destroy();
        const labels = Object.keys(expensesByCategory);
        const values = Object.values(expensesByCategory);
        expensePieChart = new Chart(DOM.expensePieChart, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#7CFC00']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // Доходы по статьям
    const incomesByCategory = {};
    currentPeriodTransactions
        .filter(t => t.type === 'income')
        .forEach(t => {
            incomesByCategory[t.incomeCategory] = (incomesByCategory[t.incomeCategory] || 0) + t.amount;
        });

    // Диаграмма доходов
    if (DOM.incomePieChart) {
        if (incomePieChart) incomePieChart.destroy();
        const labels = Object.keys(incomesByCategory);
        const values = Object.values(incomesByCategory);
        incomePieChart = new Chart(DOM.incomePieChart, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#34C759', '#4CD964', '#30D158', '#64D2FF', '#FFD700', '#FF9500', '#FF2D55', '#5856D6']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }
}

// === 13. Переключение полей формы
function setupAddForm() {
    if (!DOM.addForm) return;
    DOM.type?.addEventListener('change', toggleCategoryFields);
    toggleCategoryFields();
    if (DOM.date) {
        DOM.date.valueAsDate = new Date();
        DOM.date.max = new Date().toISOString().split('T')[0];
    }
}

function toggleCategoryFields() {
    const isIncome = DOM.type?.value === 'income';
    DOM.expenseField?.classList.toggle('hidden', isIncome);
    DOM.incomeField?.classList.toggle('hidden', !isIncome);
}

// === 14. Обработка формы добавления
function handleAddFormSubmit(e) {
    e.preventDefault();
    const type = DOM.type.value;
    const isIncome = type === 'income';
    const newTx = {
        date: DOM.date.value,
        amount: parseFloat(DOM.amount.value),
        type,
    };

    if (isIncome) {
        newTx.incomeCategory = DOM.incomeCategory.value.trim();
        if (!newTx.incomeCategory) {
            alert('Укажите статью доходов');
            return;
        }
    } else {
        newTx.expenseCategory = DOM.expenseCategory.value.trim();
        if (!newTx.expenseCategory) {
            alert('Укажите статью расходов');
            return;
        }
    }

    if (!newTx.date || isNaN(newTx.amount) || newTx.amount <= 0) {
        alert('Заполните все обязательные поля корректно');
        return;
    }

    const ref = userTransactions();
    if (!ref) {
        alert('Ошибка: не удалось получить доступ к данным. Перезагрузите страницу.');
        return;
    }

    const saveBtn = DOM.addForm.querySelector('button[type="submit"]');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Сохранение...';

    const saveOperation = editingTransactionId
        ? ref.doc(editingTransactionId).update(newTx)
        : ref.add(newTx);

    saveOperation
        .then(() => {
            resetAddForm();
        })
        .catch(err => {
            console.error('Ошибка сохранения:', err);
            alert('Ошибка: ' + err.message);
        })
        .finally(() => {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        });
}

// === 15. Сброс формы
function resetAddForm() {
    DOM.addForm?.reset();
    editingTransactionId = null;
    if (DOM.date) DOM.date.valueAsDate = new Date();
    if (DOM.addTitle) DOM.addTitle.textContent = '➕ Новая транзакция';
    if (DOM.deleteBtn) DOM.deleteBtn.classList.add('hidden');
    toggleCategoryFields();
}

// === 16. Редактирование
function editTransaction(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    editingTransactionId = id;
    show('add');
    if (DOM.addTitle) DOM.addTitle.textContent = '✏️ Редактировать транзакцию';
    if (DOM.deleteBtn) DOM.deleteBtn.classList.remove('hidden');
    DOM.date.value = tx.date;
    DOM.amount.value = tx.amount;
    DOM.comment.value = tx.comment || '';
    DOM.type.value = tx.type;
    if (tx.type === 'income') {
        DOM.incomeCategory.value = tx.incomeCategory || '';
    } else {
        DOM.expenseCategory.value = tx.expenseCategory || '';
    }
    toggleCategoryFields();
}

// === 17. Удаление
function deleteTransaction(id) {
    if (confirm('Удалить операцию?')) {
        const ref = userTransactions();
        if (!ref) {
            alert('Ошибка: не авторизован');
            return;
        }
        ref.doc(id).delete()
            .then(() => {
                show('history');
            })
            .catch(err => {
                console.error('Ошибка удаления:', err);
                alert('Не удалось удалить');
            });
    }
}

// === 18. Datalists
function updateDatalists() {
    const expenseCategories = [...new Set(transactions
        .filter(t => t.type === 'expense')
        .map(t => t.expenseCategory)
        .filter(Boolean))];
    const incomeCategories = [...new Set(transactions
        .filter(t => t.type === 'income')
        .map(t => t.incomeCategory)
        .filter(Boolean))];
    ['expense-categories', 'income-categories'].forEach(id => {
        const list = document.getElementById(id);
        if (list) {
            list.innerHTML = '';
            expenseCategories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                list.appendChild(option);
            });
        }
    });
}

// === 19. Последние 10 транзакций
function renderRecentTransactions() {
    if (!DOM.recentTransactions) return;
    DOM.recentTransactions.innerHTML = '';
    const recent = transactions.slice(0, 10);
    recent.forEach(tx => {
        const li = document.createElement('li');
        const typeIcon = tx.type === 'income'
            ? '<img src="income.png" class="type-icon">'
            : '<img src="expense.png" class="type-icon">';
        const category = tx.type === 'income' ? tx.incomeCategory : tx.expenseCategory;
        const amountColor = tx.type === 'income' ? 'var(--btn-success)' : 'var(--btn-danger)';
        const sign = tx.type === 'income' ? '+' : '-';
        li.innerHTML = `
            <div>
                <div>
                    ${typeIcon} <strong>${category}</strong>
                    <span style="color: ${amountColor}; font-weight: bold;">${sign}${formatNumber(tx.amount)} ₽</span>
                </div>
                <div class="info">${tx.date}</div>
            </div>
            <div class="actions">
                <button class="btn small" onclick="editTransaction('${tx.id}')">
                    <img src="edit.png" class="action-icon">
                </button>
                <button class="btn small danger" onclick="deleteTransaction('${tx.id}')">
                    <img src="delete.png" class="action-icon">
                </button>
            </div>
        `;
        li.style.cursor = 'default';
        DOM.recentTransactions.appendChild(li);
    });
}

// === 20. Навигация
function show(sectionId) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    const section = document.getElementById(sectionId);
    if (section) section.classList.remove('hidden');
    DOM.navBtns.forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-btn[onclick="show('${sectionId}')"]`);
    if (activeBtn) activeBtn.classList.add('active');
    const titleSpan = activeBtn?.querySelector('span');
    if (DOM.currentSectionTitle && titleSpan) {
        DOM.currentSectionTitle.textContent = titleSpan.textContent;
    }
    if (sectionId === 'history') renderAllList();
    if (sectionId === 'analytics') updateAnalytics();
    if (sectionId === 'add') setupAddForm();
}

// === 21. Тема
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('dark-theme', document.body.classList.contains('dark-theme'));
}

// === 22. Аутентификация
auth.onAuthStateChanged((user) => {
    console.log('🔐 onAuthStateChanged:', user ? user.email : 'null');
    const authScreen = document.getElementById('auth-screen');
    const app = document.getElementById('app');

    if (!authScreen || !app) {
        console.error("❌ DOM не загружен: auth-screen или app не найдены");
        return;
    }

    if (user) {
        authScreen.classList.add('hidden');
        app.classList.remove('hidden');
        loadFromFirebase();
        show('home');
    } else {
        app.classList.add('hidden');
        authScreen.classList.remove('hidden');
    }
});

// === 23. Вход
document.getElementById('login-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorElement = document.getElementById('auth-error');
    errorElement.textContent = '';
    if (!email || !password) {
        errorElement.textContent = 'Email и пароль обязательны';
        return;
    }
    auth.signInWithEmailAndPassword(email, password)
        .catch((error) => {
            const errorCode = error.code;
            if (errorCode === 'auth/wrong-password') {
                errorElement.textContent = 'Неверный пароль.';
            } else if (errorCode === 'auth/user-not-found') {
                errorElement.textContent = 'Пользователь не найден.';
            } else if (errorCode === 'auth/invalid-email') {
                errorElement.textContent = 'Неверный email.';
            } else {
                errorElement.textContent = 'Ошибка: ' + error.message;
            }
        });
});

// === 24. Выход
function logout() {
    if (confirm('Выйти?')) {
        auth.signOut().catch(err => {
            console.error('Ошибка выхода:', err);
            alert('Не удалось выйти');
        });
    }
}

// === 25. Инициализация
document.addEventListener('DOMContentLoaded', () => {
    cacheDOM();
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedDark = localStorage.getItem('dark-theme');
    const isDark = savedDark ? savedDark === 'true' : prefersDark;
    if (isDark) document.body.classList.add('dark-theme');
});
