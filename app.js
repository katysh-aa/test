// === 1. Firebase Config (оставляем compat для простоты, но можно перейти на modular)
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
let expensePieChart = null;
let incomePieChart = null;
let budgetChart = null;
let editingTransactionId = null;
let filterTimeout = null;

// === 3. Кеширование DOM-элементов
const DOM = {
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
    type: document.getElementById('type'),
    date: document.getElementById('date'),
    expenseCategory: document.getElementById('expense-category'),
    incomeCategory: document.getElementById('income-category'),
    amount: document.getElementById('amount'),
    comment: document.getElementById('comment'),
    expenseField: document.getElementById('expense-field'),
    incomeField: document.getElementById('income-field'),
    recentTransactions: document.getElementById('recent-transactions'),
    
    // Бюджеты
    budgetForm: document.getElementById('budget-form'),
    budgetCategory: document.getElementById('budget-category'),
    budgetAmount: document.getElementById('budget-amount'),
    budgetsList: document.getElementById('budgets-list'),
    
    // Навигация
    currentSectionTitle: document.getElementById('current-section-title'),
    navBtns: document.querySelectorAll('.nav-btn'),
};

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

// === 6. Загрузка данных с реактивностью
function loadFromFirebase() {
    if (!auth.currentUser) return;

    // Транзакции
    const q = userTransactions().orderBy('date', 'desc');
    q.onSnapshot((snapshot) => {
        transactions = [];
        snapshot.forEach(doc => {
            transactions.push({ id: doc.id, ...doc.data() });
        });
        // Обновляем все разделы автоматически
        updateHome();
        updateAnalytics();
        if (!DOM.allTransactions?.closest('.hidden')) {
            renderAllList();
        }
        updateDatalists();
        renderRecentTransactions();
    }, error => {
        console.error("Ошибка загрузки транзакций:", error);
    });

    // Бюджеты
    const b = userBudgets();
    b.onSnapshot((snapshot) => {
        budgets = [];
        snapshot.forEach(doc => {
            budgets.push({ id: doc.id, ...doc.data() });
        });
        if (!DOM.budgetsList?.closest('.hidden')) {
            renderBudgets();
        }
    });
}

// === 7. Обновление главной
function updateHome() {
    const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

    const expense = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

    const balance = income - expense;
    const nextPayday = getNextPayday();
    const daysUntil = Math.max(1, Math.ceil((nextPayday - new Date()) / (1000 * 60 * 60 * 24)));
    const dailyBudget = balance / daysUntil;

    // Обновляем элементы
    if (DOM.currentBalance) DOM.currentBalance.textContent = formatNumber(balance) + ' ₽';
    if (DOM.totalIncome) DOM.totalIncome.textContent = formatNumber(income) + ' ₽';
    if (DOM.totalExpense) DOM.totalExpense.textContent = formatNumber(expense) + ' ₽';
    if (DOM.daysUntilPayday) DOM.daysUntilPayday.textContent = daysUntil + ' дней';
    if (DOM.dailyBudget) DOM.dailyBudget.textContent = formatNumber(dailyBudget) + ' ₽';
    if (DOM.nextPayday) DOM.nextPayday.textContent = nextPayday.toLocaleDateString('ru-RU');
    if (DOM.progressText) DOM.progressText.textContent = `Остаток: ${formatNumber(balance)} ₽`;
}

// === 8. Логика "следующей зарплаты"
function getNextPayday() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    let targetMonth = new Date(year, month, 20);
    while (targetMonth > today && targetMonth.getDate() > 20) {
        targetMonth.setDate(targetMonth.getDate() - 1);
    }
    while (targetMonth.getDay() === 0 || targetMonth.getDay() === 6) {
        targetMonth.setDate(targetMonth.getDate() - 1);
    }
    if (targetMonth < today) {
        targetMonth = new Date(year, month + 1, 5);
        while (targetMonth.getDay() === 0 || targetMonth.getDay() === 6) {
            targetMonth.setDate(targetMonth.getDate() - 1);
        }
    }
    return targetMonth;
}

// === 9. Отображение истории
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
        const comment = tx.comment ? `<div class="info">💬 ${tx.comment}</div>` : '';
        const detail = tx.type === 'income' && tx.incomeCategory
            ? `<div class="info">💼 ${tx.incomeCategory}</div>`
            : (tx.expenseCategory ? `<div class="info">🏷️ ${tx.expenseCategory}</div>` : '');

        li.innerHTML = `
            <div>
                <div><strong>${tx.type === 'income' ? tx.incomeCategory : tx.expenseCategory}</strong> 
                    <span style="color: ${amountColor}; font-weight: bold;">${sign}${formatNumber(tx.amount)} ₽</span>
                </div>
                <div class="info">${tx.date}</div>
                ${detail}
                ${comment}
            </div>
            <div class="actions">
                <button class="btn small" onclick="editTransaction('${tx.id}')">✏️</button>
                <button class="btn small danger" onclick="deleteTransaction('${tx.id}')">🗑️</button>
            </div>
        `;
        DOM.allTransactions.appendChild(li);
    });
}

// === 10. Фильтры с дебаунсом
function filterByDate() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(renderAllList, 300);
}

function clearFilter() {
    if (DOM.filterStart) DOM.filterStart.value = '';
    if (DOM.filterEnd) DOM.filterEnd.value = '';
    renderAllList();
}

// === 11. Анализ: диаграммы и отчёт
function updateAnalytics() {
    // Расходы по категориям
    const expensesByCategory = {};
    transactions
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
    transactions
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

// === 12. Форма добавления: переключение полей
function setupAddForm() {
    if (!DOM.addForm) return;

    DOM.type?.addEventListener('change', toggleCategoryFields);
    toggleCategoryFields();

    // Устанавливаем сегодняшнюю дату
    if (DOM.date && !DOM.date.value) {
        DOM.date.valueAsDate = new Date();
    }
}

function toggleCategoryFields() {
    const isIncome = DOM.type?.value === 'income';
    DOM.expenseField?.classList.toggle('hidden', isIncome);
    DOM.incomeField?.classList.toggle('hidden', !isIncome);
}

// === 13. Добавление/редактирование транзакции
DOM.addForm?.addEventListener('submit', e => {
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
            show('home');
        })
        .catch(err => {
            console.error('Ошибка сохранения:', err);
            alert('Ошибка: ' + err.message);
        })
        .finally(() => {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        });
});

// === 14. Сброс формы
function resetAddForm() {
    DOM.addForm?.reset();
    editingTransactionId = null;
    if (DOM.date) DOM.date.valueAsDate = new Date();
    toggleCategoryFields();
}

// === 15. Редактирование
function editTransaction(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;

    editingTransactionId = id;
    show('add');

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

// === 16. Удаление
function deleteTransaction(id) {
    if (confirm('Удалить операцию?')) {
        userTransactions().doc(id).delete()
            .catch(err => {
                console.error('Ошибка удаления:', err);
                alert('Не удалось удалить');
            });
    }
}

// === 17. Datalists
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

// === 18. Последние 10 транзакций
function renderRecentTransactions() {
    if (!DOM.recentTransactions) return;
    DOM.recentTransactions.innerHTML = '';
    const recent = transactions.slice(0, 10);
    recent.forEach(tx => {
        const li = document.createElement('li');
        const type = tx.type === 'income' ? '📥 Доход' : '📤 Расход';
        const category = tx.type === 'income' ? tx.incomeCategory : tx.expenseCategory;
        li.innerHTML = `
            <div><strong>${category}</strong> — ${formatNumber(tx.amount)} ₽</div>
            <div class="info">${tx.date} · ${type}</div>
        `;
        li.style.cursor = 'pointer';
        li.onclick = () => {
            editTransaction(tx.id);
        };
        DOM.recentTransactions.appendChild(li);
    });
}

// === 19. Бюджеты
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
                <button class="btn small danger" onclick="deleteBudget('${budget.id}')">🗑️</button>
            </div>
        `;
        DOM.budgetsList.appendChild(li);
    });
}

DOM.budgetForm?.addEventListener('submit', e => {
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

function deleteBudget(id) {
    if (confirm('Удалить бюджет?')) {
        userBudgets().doc(id).delete();
    }
}

// === 20. Навигация
function show(sectionId) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(sectionId).classList.remove('hidden');
    DOM.navBtns.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.nav-btn[onclick="show('${sectionId}')"]`).classList.add('active');
    DOM.currentSectionTitle.textContent = document.querySelector(`.nav-btn[onclick="show('${sectionId}')"] span`).textContent;

    if (sectionId === 'history') renderAllList();
    if (sectionId === 'analytics') updateAnalytics();
    if (sectionId === 'add') setupAddForm();
    if (sectionId === 'budgets') renderBudgets();
}

// === 21. Тема
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('dark-theme', document.body.classList.contains('dark-theme'));
}

// === 22. Аутентификация
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
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedDark = localStorage.getItem('dark-theme');
    const isDark = savedDark ? savedDark === 'true' : prefersDark;
    if (isDark) document.body.classList.add('dark-theme');
});
