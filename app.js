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
let budgets = [];
let obligatoryExpenses = []; // НОВОЕ: обязательные платежи
let expensePieChart = null;
let incomePieChart = null;
let editingTransactionId = null;
let filterTimeout = null;
let notificationTime = localStorage.getItem('notificationTime') || ''; // НОВОЕ
let DOM = {};

// === 3. Кеширование DOM-элементов
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
        // Бюджеты
        budgetForm: document.getElementById('budget-form'),
        budgetCategory: document.getElementById('budget-category'),
        budgetAmount: document.getElementById('budget-amount'),
        budgetsList: document.getElementById('budgets-list'),
        // Обязательные платежи (НОВОЕ)
        obligatoryForm: document.getElementById('obligatory-form'),
        obligatoryName: document.getElementById('obligatory-name'),
        obligatoryAmount: document.getElementById('obligatory-amount'),
        obligatoryDueDate: document.getElementById('obligatory-due-date'),
        obligatoryRepeat: document.getElementById('obligatory-repeat'),
        obligatoryList: document.getElementById('obligatory-list'),
        // Уведомления (НОВОЕ)
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

// === 5. Коллекции Firebase
function userTransactions() {
    return db.collection('users').doc(auth.currentUser?.uid).collection('transactions');
}
function userBudgets() {
    return db.collection('users').doc(auth.currentUser?.uid).collection('budgets');
}
function userObligatoryExpenses() {
    return db.collection('users').doc(auth.currentUser?.uid).collection('obligatoryExpenses');
}

// === 6. Загрузка данных с реактивностью
function loadFromFirebase() {
    if (!auth.currentUser) return;

    const q = userTransactions().orderBy('date', 'desc');
    q.onSnapshot((snapshot) => {
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
    });

    const b = userBudgets();
    b.onSnapshot((snapshot) => {
        budgets = [];
        snapshot.forEach(doc => {
            budgets.push({ id: doc.id, ...doc.data() });
        });
        if (DOM.budgetsList && !DOM.budgetsList.closest('.hidden')) {
            renderBudgets();
        }
    });

    // НОВОЕ: Подписка на обязательные платежи
    userObligatoryExpenses().onSnapshot((snapshot) => {
        obligatoryExpenses = [];
        snapshot.forEach(doc => {
            obligatoryExpenses.push({ id: doc.id, ...doc.data() });
        });
        if (DOM.obligatoryList && !DOM.obligatoryList.closest('.hidden')) {
            renderObligatoryList();
        }
        if (!DOM.home?.classList.contains('hidden')) {
            updateHome();
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

// === 9. Рассчитать сумму обязательных платежей в периоде
function getTotalObligatoryExpensesInPeriod(periodStart, nextPayday) {
    const startStr = periodStart.toISOString().split('T')[0];
    const endStr = nextPayday.toISOString().split('T')[0];

    return obligatoryExpenses.reduce((total, exp) => {
        const expDate = exp.dueDate; // строка "2025-04-10"
        if (expDate >= startStr && expDate <= endStr) {
            return total + exp.amount;
        }
        return total;
    }, 0);
}

// === 10. Обновление главной
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

    // НОВОЕ: Учитываем обязательные платежи
    const obligatoryTotal = getTotalObligatoryExpensesInPeriod(periodStart, nextPayday);
    const availableForDaily = Math.max(0, balance - obligatoryTotal);
    const dailyBudget = availableForDaily / daysUntil;

    if (DOM.currentBalance) DOM.currentBalance.textContent = formatNumber(balance) + ' ₽';
    if (DOM.dailyBudget) DOM.dailyBudget.textContent = formatNumber(dailyBudget) + ' ₽';
    if (DOM.daysUntilPayday) DOM.daysUntilPayday.textContent = daysUntil + ' дней';
    if (DOM.nextPayday) DOM.nextPayday.textContent = nextPayday.toLocaleDateString('ru-RU');
}

// === 11. Отображение истории
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

// === 12. Фильтры с дебаунсом
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

// === 13. Анализ: диаграммы и отчёт
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
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
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
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    }
}

// === 14. Форма добавления: переключение полей
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

// === 15. Добавление/редактирование транзакции
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
    const saveBtn = DOM.addForm.querySelector('button[type="submit"]');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Сохранение...';
    const saveOperation = editingTransactionId
        ? userTransactions().doc(editingTransactionId).update(newTx)
        : userTransactions().add(newTx);
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
if (DOM.addForm) {
    DOM.addForm.addEventListener('submit', handleAddFormSubmit);
}

// === 16. Сброс формы
function resetAddForm() {
    DOM.addForm?.reset();
    editingTransactionId = null;
    if (DOM.date) DOM.date.valueAsDate = new Date();
    if (DOM.addTitle) DOM.addTitle.textContent = '➕ Новая транзакция';
    if (DOM.deleteBtn) DOM.deleteBtn.classList.add('hidden');
    toggleCategoryFields();
}

// === 17. Редактирование
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

// === 18. Удаление
function deleteTransaction(id) {
    if (confirm('Удалить операцию?')) {
        userTransactions().doc(id).delete()
            .then(() => {
                show('history');
            })
            .catch(err => {
                console.error('Ошибка удаления:', err);
                alert('Не удалось удалить');
            });
    }
}

// === 19. Datalists
function updateDatalists() {
    const expenseCategories = [...new Set(transactions
        .filter(t => t.type === 'expense')
        .map(t => t.expenseCategory)
        .filter(Boolean))];
    const incomeCategories = [...new Set(transactions
        .filter(t => t.type === 'income')
        .map(t => t.incomeCategory)
        .filter(Boolean))];
    const expenseDatalist = document.getElementById('expense-categories');
    const incomeDatalist = document.getElementById('income-categories');
    if (expenseDatalist) {
        expenseDatalist.innerHTML = '';
        expenseCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            expenseDatalist.appendChild(option);
        });
    }
    if (incomeDatalist) {
        incomeDatalist.innerHTML = '';
        incomeCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            incomeDatalist.appendChild(option);
        });
    }
}

// === 20. Последние 10 транзакций
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

// === 21. Бюджеты
function renderBudgets() {
    if (!DOM.budgetsList) return;
    DOM.budgetsList.innerHTML = '';
    budgets.forEach(budget => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div>
                <div><strong>${budget.category}</strong>: ${formatNumber(budget.limit)} ₽</div>
            </div>
            <div class="actions">
                <button class="btn small danger" onclick="deleteBudget('${budget.id}')">
                    <img src="delete.png" class="action-icon">
                </button>
            </div>
        `;
        DOM.budgetsList.appendChild(li);
    });
}
if (DOM.budgetForm) {
    DOM.budgetForm.addEventListener('submit', e => {
        e.preventDefault();
        const category = DOM.budgetCategory.value.trim();
        const limit = parseFloat(DOM.budgetAmount.value);
        if (!category || isNaN(limit) || limit <= 0) {
            alert('Заполните корректно');
            return;
        }
        userBudgets().add({ category, limit });
        DOM.budgetForm.reset();
    });
}
function deleteBudget(id) {
    if (confirm('Удалить бюджет?')) {
        userBudgets().doc(id).delete();
    }
}

// === 22. Обязательные платежи
function renderObligatoryList() {
    if (!DOM.obligatoryList) return;
    DOM.obligatoryList.innerHTML = '';
    if (obligatoryExpenses.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Нет обязательных платежей';
        li.style.color = '#999';
        DOM.obligatoryList.appendChild(li);
        return;
    }
    obligatoryExpenses.forEach(exp => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div>
                <div><strong>${exp.name}</strong>: ${formatNumber(exp.amount)} ₽</div>
                <div class="info">Дата: ${exp.dueDate} (${exp.repeat === 'monthly' ? 'каждый месяц' : 'однократно'})</div>
            </div>
            <div class="actions">
                <button class="btn small danger" onclick="deleteObligatory('${exp.id}')">
                    <img src="delete.png" class="action-icon">
                </button>
            </div>
        `;
        DOM.obligatoryList.appendChild(li);
    });
}
if (DOM.obligatoryForm) {
    DOM.obligatoryForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const name = DOM.obligatoryName.value.trim();
        const amount = parseFloat(DOM.obligatoryAmount.value);
        const dueDate = DOM.obligatoryDueDate.value;
        const repeat = DOM.obligatoryRepeat.value;
        if (!name || isNaN(amount) || amount <= 0 || !dueDate) {
            alert('Заполните все поля корректно');
            return;
        }
        userObligatoryExpenses().add({
            name,
            amount,
            dueDate,
            repeat,
            createdAt: new Date().toISOString().split('T')[0]
        }).then(() => {
            DOM.obligatoryForm.reset();
        }).catch(err => {
            console.error('Ошибка добавления обязательной траты:', err);
            alert('Не удалось сохранить');
        });
    });
}
function deleteObligatory(id) {
    if (confirm('Удалить обязательный платёж?')) {
        userObligatoryExpenses().doc(id).delete()
            .catch(err => {
                console.error('Ошибка удаления:', err);
                alert('Не удалось удалить');
            });
    }
}

// === 23. Уведомления
function saveNotificationTime(value = null) {
    const time = value || DOM.notificationTimeInput?.value;
    if (!time) return;
    notificationTime = time;
    localStorage.setItem('notificationTime', time);
    alert(`Уведомление будет в ${time}`);
}
function startNotificationChecker() {
    setInterval(() => {
        if (!notificationTime || !auth.currentUser) return;
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const currentHM = `${hours}:${minutes}`;
        if (currentHM === notificationTime) {
            const { nextPayday, periodStart } = getCurrentBudgetPeriodAndNextPayday();
            const daysUntil = Math.max(1, Math.ceil((nextPayday - now) / (1000 * 60 * 60 * 24)));
            const currentPeriodTransactions = transactions.filter(t => {
                const date = new Date(t.date);
                return date >= periodStart && date <= now;
            });
            const income = currentPeriodTransactions.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
            const expense = currentPeriodTransactions.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
            const balance = income - expense;
            const obligatoryTotal = getTotalObligatoryExpensesInPeriod(periodStart, nextPayday);
            const dailyBudget = (balance - obligatoryTotal) / daysUntil;
            const msg = `До зарплаты: ${daysUntil} дней\nДневной бюджет: ${formatNumber(dailyBudget)} ₽`;
            if (Notification.permission === 'granted') {
                new Notification('Семейный бюджет', { body: msg });
            } else {
                alert(msg);
            }
            notificationTime = ''; // блокируем повтор
            setTimeout(() => {
                notificationTime = localStorage.getItem('notificationTime') || '';
            }, 60000);
        }
    }, 60000); // раз в минуту
}
function initNotificationTime() {
    if (DOM.notificationTimeInput) {
        DOM.notificationTimeInput.value = notificationTime;
        DOM.notificationTimeInput.addEventListener('change', (e) => {
            saveNotificationTime(e.target.value);
        });
    }
    startNotificationChecker();
}

// === 24. Навигация
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
    if (sectionId === 'budgets') {
        renderBudgets();
        renderObligatoryList();
    }
}

// === 25. Тема
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('dark-theme', document.body.classList.contains('dark-theme'));
}

// === 26. Аутентификация
auth.onAuthStateChanged((user) => {
    if (user) {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        loadFromFirebase();
        show('home');
    } else {
        document.getElementById('app').classList.add('hidden');
        document.getElementById('auth-screen').classList.remove('hidden');
    }
});

// === 27. Вход
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

// === 28. Выход
function logout() {
    if (confirm('Выйти?')) {
        auth.signOut().catch(err => {
            console.error('Ошибка выхода:', err);
            alert('Не удалось выйти');
        });
    }
}

// === 29. Инициализация
document.addEventListener('DOMContentLoaded', () => {
    cacheDOM();
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedDark = localStorage.getItem('dark-theme');
    const isDark = savedDark ? savedDark === 'true' : prefersDark;
    if (isDark) document.body.classList.add('dark-theme');
    initNotificationTime(); // НОВОЕ: запуск уведомлений
});
