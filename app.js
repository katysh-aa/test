// === 1. Firebase Config (исправлено — соответствует Firebase Config.txt)
const firebaseConfig = {
    apiKey: "AIzaSyDD_AvYiJU5j8O7NPjqUhy9_KiVkaW0SUs",
    authDomain: "bank-fin.firebaseapp.com",
    projectId: "bank-fin",
    storageBucket: "bank-fin.firebasestorage.app",
    messagingSenderId: "283942975264",
    appId: "1:283942975264:web:440d8ea2d5d2d733fe4945",
    measurementId: "G-RM3VME3MV0"
};

// Инициализация Firebase (через compat)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// === 2. Глобальные переменные
let transactions = [];
let budgets = [];
let expensePieChart = null;
let incomePieChart = null;
let editingTransactionId = null;
let filterTimeout = null;
let DOM = {};
let notifications = {
    balance: 0,
    daily: false,
    overallBudget: false,
    categoryBudget: false
};

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
        // Настройки уведомлений
        notifyBalance: document.getElementById('notify-balance'),
        notifyDaily: document.getElementById('notify-daily'),
        notifyOverallBudget: document.getElementById('notify-overall-budget'),
        notifyCategoryBudget: document.getElementById('notify-category-budget'),
        notifyBalanceSettings: document.getElementById('notify-balance-settings'),
        notifyDailySettings: document.getElementById('notify-daily-settings'),
        notifyOverallBudgetSettings: document.getElementById('notify-overall-budget-settings'),
        notifyCategoryBudgetSettings: document.getElementById('notify-category-budget-settings'),
        // Навигация
        currentSectionTitle: document.getElementById('current-section-title'),
        navBtns: document.querySelectorAll('.nav-btn'),
    };

    // Загрузка уведомлений из localStorage
    const saved = localStorage.getItem('notifications');
    if (saved) {
        notifications = JSON.parse(saved);
        if (DOM.notifyBalance) DOM.notifyBalance.value = notifications.balance;
        if (DOM.notifyDaily) DOM.notifyDaily.checked = notifications.daily;
        if (DOM.notifyOverallBudget) DOM.notifyOverallBudget.checked = notifications.overallBudget;
        if (DOM.notifyCategoryBudget) DOM.notifyCategoryBudget.checked = notifications.categoryBudget;
        // Для страницы настроек
        if (DOM.notifyBalanceSettings) DOM.notifyBalanceSettings.value = notifications.balance;
        if (DOM.notifyDailySettings) DOM.notifyDailySettings.checked = notifications.daily;
        if (DOM.notifyOverallBudgetSettings) DOM.notifyOverallBudgetSettings.checked = notifications.overallBudget;
        if (DOM.notifyCategoryBudgetSettings) DOM.notifyCategoryBudgetSettings.checked = notifications.categoryBudget;
    }
}

// === 4. Сохранение уведомлений
function saveNotifications() {
    notifications.balance = parseFloat(DOM.notifyBalance?.value) || 0;
    notifications.daily = DOM.notifyDaily?.checked || false;
    notifications.overallBudget = DOM.notifyOverallBudget?.checked || false;
    notifications.categoryBudget = DOM.notifyCategoryBudget?.checked || false;

    localStorage.setItem('notifications', JSON.stringify(notifications));
    alert('Настройки уведомлений сохранены');
}

// === 5. Проверка уведомлений
function checkNotifications(balance, dailyBudget, totalExpense) {
    // Уведомление о низком остатке
    if (notifications.balance > 0 && balance < notifications.balance) {
        alert(`⚠️ Остаток ниже ${notifications.balance} ₽`);
    }
    // Уведомление о дневном бюджете
    if (notifications.daily && balance <= dailyBudget) {
        alert('💡 Сегодня вы достигли дневного бюджета');
    }
    // Уведомление о превышении общего бюджета
    if (notifications.overallBudget) {
        const { periodStart } = getCurrentBudgetPeriodAndNextPayday();
        const startStr = periodStart.toISOString().split('T')[0];
        const todayStr = new Date().toISOString().split('T')[0];
        const currentPeriodIncome = transactions
            .filter(t => t.type === 'income' && t.date >= startStr && t.date <= todayStr)
            .reduce((sum, t) => sum + t.amount, 0);
        const currentPeriodExpense = transactions
            .filter(t => t.type === 'expense' && t.date >= startStr && t.date <= todayStr)
            .reduce((sum, t) => sum + t.amount, 0);
        const budgetRatio = currentPeriodExpense / currentPeriodIncome;
        if (budgetRatio >= 0.9) {
            alert('⚠️ Расходы превышают 90% от доходов за период');
        }
    }
    // Уведомление о превышении по категории
    if (notifications.categoryBudget) {
        const { periodStart } = getCurrentBudgetPeriodAndNextPayday();
        const startStr = periodStart.toISOString().split('T')[0];
        const todayStr = new Date().toISOString().split('T')[0];
        const currentPeriodExpenses = transactions
            .filter(t => t.type === 'expense' && t.date >= startStr && t.date <= todayStr);
        const expensesByCategory = {};
        currentPeriodExpenses.forEach(t => {
            expensesByCategory[t.expenseCategory] = (expensesByCategory[t.expenseCategory] || 0) + t.amount;
        });
        budgets.forEach(budget => {
            const spent = expensesByCategory[budget.category] || 0;
            if (spent >= budget.limit * 0.9) {
                alert(`⚠️ Категория "${budget.category}" почти достигла лимита (${formatNumber(spent)} ₽ из ${formatNumber(budget.limit)} ₽)`);
            }
        });
    }
}

// === 6. Форматирование чисел
function formatNumber(num) {
    if (isNaN(num) || num === null) return "0";
    return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// === 7. Коллекции Firebase
function userTransactions() {
    return db.collection('users').doc(auth.currentUser?.uid).collection('transactions');
}
function userBudgets() {
    return db.collection('users').doc(auth.currentUser?.uid).collection('budgets');
}

// === 8. Загрузка данных с реактивностью
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
        showRefreshIndicator();
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
}

// === 9. Последний рабочий день перед датой
function getLastWorkdayBefore(day, month, year) {
    const date = new Date(year, month, day);
    while (date.getDay() === 0 || date.getDay() === 6) {
        date.setDate(date.getDate() - 1);
    }
    return new Date(date);
}

// === 10. Определение следующей зарплаты и периода
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

    const prev5 = new Date(year, currentMonth, 5);
    const actualPrev5 = prev5.getDay() === 0 || prev5.getDay() === 6
        ? getLastWorkdayBefore(5, currentMonth, year)
        : prev5;

    let nextPayday, prevPayday;

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

// === 11. Обновление главной
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
    const daysUntilMs = nextPayday - new Date();
    const daysUntil = Math.ceil(daysUntilMs / (1000 * 60 * 60 * 24));
    const dailyBudget = daysUntil > 0 ? balance / daysUntil : 0;

    // Форматируем дни до зарплаты
    let daysText;
    if (daysUntil <= 0) {
        daysText = "Сегодня";
    } else if (daysUntil === 1) {
        daysText = "Завтра";
    } else {
        daysText = `${daysUntil} дней`;
    }

    if (DOM.currentBalance) DOM.currentBalance.textContent = formatNumber(balance) + ' ₽';
    if (DOM.dailyBudget) DOM.dailyBudget.textContent = formatNumber(dailyBudget) + ' ₽';
    if (DOM.daysUntilPayday) DOM.daysUntilPayday.textContent = daysText;
    if (DOM.nextPayday) DOM.nextPayday.textContent = nextPayday.toLocaleDateString('ru-RU');

    // Проверка уведомлений
    checkNotifications(balance, dailyBudget, expense);
}

// === 12. Экспорт в Excel
function exportToExcel() {
    const { periodStart } = getCurrentBudgetPeriodAndNextPayday();
    const startStr = DOM.filterStart?.value || periodStart.toISOString().split('T')[0];
    const endStr = DOM.filterEnd?.value || new Date().toISOString().split('T')[0];

    const filtered = transactions.filter(t => t.date >= startStr && t.date <= endStr);

    if (filtered.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }

    const data = filtered.map(t => ({
        Дата: t.date,
        Тип: t.type === 'income' ? 'Доход' : 'Расход',
        Категория: t.type === 'income' ? t.incomeCategory : t.expenseCategory,
        Сумма: t.amount,
        Комментарий: t.comment || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Операции');
    XLSX.writeFile(wb, `Бюджет_${startStr}_до_${endStr}.xlsx`);
}

// === 13. Отображение истории
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

// === 14. Фильтры с дебаунсом
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

// === 15. Индикатор обновления
function showRefreshIndicator() {
    const indicator = document.getElementById('refresh-indicator');
    if (indicator) {
        indicator.classList.add('active');
        setTimeout(() => indicator.classList.remove('active'), 1000);
    }
}

// === 16. Анализ: диаграммы и отчёт
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

// === 17. Форма добавления: переключение полей
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

// === 18. Добавление/редактирование транзакции
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

// === 19. Сброс формы
function resetAddForm() {
    DOM.addForm?.reset();
    editingTransactionId = null;
    if (DOM.date) DOM.date.valueAsDate = new Date();
    if (DOM.addTitle) DOM.addTitle.textContent = '➕ Новая транзакция';
    if (DOM.deleteBtn) DOM.deleteBtn.classList.add('hidden');
    toggleCategoryFields();
}

// === 20. Редактирование
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

// === 21. Удаление (не переключаем на "Историю")
function deleteTransaction(id) {
    if (confirm('Удалить операцию?')) {
        userTransactions().doc(id).delete()
            .then(() => {
                // Остаемся на текущей вкладке, просто обновляем данные
                if (document.getElementById('add').classList.contains('hidden')) {
                    renderAllList();
                }
                renderRecentTransactions();
            })
            .catch(err => {
                console.error('Ошибка удаления:', err);
                alert('Не удалось удалить');
            });
    }
}

// === 22. Datalists
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

// === 23. Последние 10 транзакций
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

// === 24. Бюджеты
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

// === 25. Навигация
function show(sectionId) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    const section = document.getElementById(sectionId);
    if (section) section.classList.remove('hidden');
    DOM.navBtns.forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-btn[data-section="${sectionId}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    const titleSpan = activeBtn?.querySelector('span');
    if (DOM.currentSectionTitle && titleSpan) {
        DOM.currentSectionTitle.textContent = titleSpan.textContent;
    }
    if (sectionId === 'history') renderAllList();
    if (sectionId === 'analytics') updateAnalytics();
    if (sectionId === 'add') setupAddForm();
    if (sectionId === 'budgets') renderBudgets();
    if (sectionId === 'settings') {
        // Загружаем текущие значения
        if (DOM.notifyBalanceSettings) DOM.notifyBalanceSettings.value = notifications.balance;
        if (DOM.notifyDailySettings) DOM.notifyDailySettings.checked = notifications.daily;
        if (DOM.notifyOverallBudgetSettings) DOM.notifyOverallBudgetSettings.checked = notifications.overallBudget;
        if (DOM.notifyCategoryBudgetSettings) DOM.notifyCategoryBudgetSettings.checked = notifications.categoryBudget;
    }
}

// === 26. Тема
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('dark-theme', document.body.classList.contains('dark-theme'));
}

// === 27. Аутентификация
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

// === 28. Вход
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

// === 29. Выход
function logout() {
    if (confirm('Выйти?')) {
        auth.signOut().catch(err => {
            console.error('Ошибка выхода:', err);
            alert('Не удалось выйти');
        });
    }
}

// === 30. Инициализация
document.addEventListener('DOMContentLoaded', () => {
    cacheDOM();
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedDark = localStorage.getItem('dark-theme');
    const isDark = savedDark ? savedDark === 'true' : prefersDark;
    if (isDark) document.body.classList.add('dark-theme');
});