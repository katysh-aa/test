// === app.js — Главный управляющий скрипт

// === 1. Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyCw3MkLyY_3wL5lPFZP3RN3pNNL_5MXfCQ",
    authDomain: "budget-d7b61.firebaseapp.com",
    projectId: "budget-d7b61",
    storageBucket: "budget-d7b61.firebasestorage.app",
    messagingSenderId: "853003887380",
    appId: "1:853003887380:web:5aa5fda151ff9823c9d801",
    measurementId: "G-0JZTCC3MLW"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const transactionsCollection = db.collection('transactions');
const plansCollection = db.collection('financial-plans');
const goalDocRef = db.collection('settings').doc('goal');

// === 2. Глобальные переменные
let transactions = [];
let savingsGoal = 500000;
let financialPlans = [];

// === 3. Форматирование чисел
function formatNumber(num) {
    if (isNaN(num) || num === null) return "0";
    return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Форматирование в тыс. р.
function formatShort(num) {
    if (isNaN(num) || num === null) return "0";
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + " тыс. р.";
}

// === 4. Загрузка цели
function loadGoalFromFirebase() {
    goalDocRef.onSnapshot(doc => {
        if (doc.exists) {
            savingsGoal = doc.data().amount || 500000;
        } else {
            savingsGoal = 500000;
            goalDocRef.set({ amount: savingsGoal });
        }
        const input = document.getElementById('savings-goal');
        if (input) input.value = savingsGoal;
        updateHome();
        localStorage.setItem('savingsGoal', savingsGoal);
    });
}

// === 5. Сохранение цели
function saveGoal() {
    const input = document.getElementById('savings-goal');
    const value = parseFloat(input.value);
    if (isNaN(value) || value < 0) {
        alert('Введите корректную сумму');
        return;
    }
    goalDocRef.set({ amount: value })
        .then(() => {
            savingsGoal = value;
            localStorage.setItem('savingsGoal', savingsGoal);
            updateHome();
            alert(`🎯 Цель обновлена: ${formatNumber(savingsGoal)} ₽`);
        })
        .catch(err => {
            console.error("Ошибка сохранения цели:", err);
            alert("Не удалось сохранить цель.");
        });
}

// === 6. Загрузка данных
function loadFromFirebase() {
    transactionsCollection.orderBy('date', 'desc').onSnapshot(snapshot => {
        transactions = [];
        snapshot.forEach(doc => {
            transactions.push({ id: doc.id, ...doc.data() });
        });
        renderRecentList();
        updateHome();
        updateAnalytics();
        if (document.getElementById('list')?.style.display !== 'none') {
            renderAllList();
        }
    });

    plansCollection.onSnapshot(snapshot => {
        financialPlans = [];
        snapshot.forEach(doc => {
            financialPlans.push({ id: doc.id, ...doc.data() });
        });
        renderPlanList();
        updateAnalytics();
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
    const savings = income - expense;
    const progress = savingsGoal > 0 ? Math.min(100, (savings / savingsGoal) * 100) : 0;

    const totalSavingsEl = document.getElementById('total-savings');
    const progressFillEl = document.getElementById('progress-fill');
    const progressTextEl = document.getElementById('progress-text');
    const totalIncomeEl = document.getElementById('total-income');
    const totalExpenseEl = document.getElementById('total-expense');

    if (totalSavingsEl) totalSavingsEl.textContent = formatNumber(savings) + ' ₽';
    if (progressFillEl) progressFillEl.style.width = progress + '%';
    if (progressTextEl) progressTextEl.textContent =
        `${Math.round(progress)}% от цели (${formatNumber(savings)} / ${formatNumber(savingsGoal)} ₽)`;
    if (progressFillEl) progressFillEl.style.background = savings >= savingsGoal ? '#34c759' : '#007AFF';
    if (totalIncomeEl) totalIncomeEl.textContent = formatNumber(income) + ' ₽';
    if (totalExpenseEl) totalExpenseEl.textContent = formatNumber(expense) + ' ₽';
}

// === 8. Последние 10 операций
function renderRecentList() {
    const list = document.getElementById('recent-transactions');
    if (!list) return;
    list.innerHTML = '';
    const recent = [...transactions]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);
    if (recent.length === 0) {
        const li = document.createElement('li');
        li.style.color = '#999';
        li.style.fontStyle = 'italic';
        li.textContent = 'Нет записей';
        list.appendChild(li);
        return;
    }
    recent.forEach(tx => {
        const li = document.createElement('li');
        const amountColor = tx.type === 'income' ? '#34c759' : '#ff3b30';
        const sign = tx.type === 'income' ? '+' : '-';
        const comment = tx.comment ? `<div class="info">💬 ${tx.comment}</div>` : '';
        li.innerHTML = `
            <div>
                <div><strong>${tx.category}</strong> <span style="color: ${amountColor}; font-weight: bold;">${sign}${formatNumber(tx.amount)} ₽</span></div>
                <div class="info">${tx.date} · ${tx.author}</div>
                ${comment}
            </div>
            <div class="actions">
                <button class="btn small" onclick="startEdit('${tx.id}')">✏️</button>
                <button class="btn small danger" onclick="deleteTransaction('${tx.id}')">🗑️</button>
            </div>
        `;
        list.appendChild(li);
    });
}

// === 9. Добавление операции
document.getElementById('add-form').addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    const newTx = {
        date: form.date.value,
        category: form.category.value,
        amount: parseFloat(form.amount.value),
        type: form.type.value,
        author: form.author.value,
        comment: form.comment.value || ''
    };
    transactionsCollection.add(newTx)
        .then(() => {
            form.reset();
            if (document.getElementById('list')?.style.display !== 'none') {
                renderAllList();
            }
        })
        .catch(err => alert('Ошибка: ' + err.message));
});

// === 10. Редактирование операции
function startEdit(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    document.getElementById('edit-id').value = tx.id;
    document.getElementById('edit-date').value = tx.date;
    document.getElementById('edit-category').value = tx.category;
    document.getElementById('edit-amount').value = tx.amount;
    document.getElementById('edit-type').value = tx.type;
    document.getElementById('edit-author').value = tx.author;
    document.getElementById('edit-comment').value = tx.comment || '';
    document.getElementById('edit-form').style.display = 'block';
}

document.getElementById('edit-form').addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    const id = form['edit-id'].value;
    const updatedTx = {
        date: form['edit-date'].value,
        category: form['edit-category'].value,
        amount: parseFloat(form['edit-amount'].value),
        type: form['edit-type'].value,
        author: form['edit-author'].value,
        comment: form['edit-comment'].value || ''
    };
    transactionsCollection.doc(id).update(updatedTx)
        .then(() => {
            document.getElementById('edit-form').style.display = 'none';
            form.reset();
            if (document.getElementById('list')?.style.display !== 'none') {
                renderAllList();
            }
        })
        .catch(err => alert('Ошибка: ' + err.message));
});

function cancelEdit() {
    document.getElementById('edit-form').style.display = 'none';
    document.getElementById('edit-form').reset();
}

// === 11. Удаление операции
function deleteTransaction(id) {
    if (confirm('Удалить операцию?')) {
        transactionsCollection.doc(id).delete();
    }
}

// === 12. Финансовый план: отображение
function renderPlanList() {
    const list = document.getElementById('plan-list');
    if (!list) return;
    list.innerHTML = '';
    if (financialPlans.length === 0) {
        const li = document.createElement('li');
        li.style.color = '#999';
        li.style.fontStyle = 'italic';
        li.textContent = 'Пока нет планов';
        list.appendChild(li);
        return;
    }
    financialPlans
        .sort((a, b) => a.month.localeCompare(b.month))
        .forEach(plan => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div>
                    <div><strong>${formatMonth(plan.month)}</strong></div>
                    <div class="info">Доход: ${formatNumber(plan.income)} ₽ · Расход: ${formatNumber(plan.expense)} ₽</div>
                </div>
                <div class="actions">
                    <button class="btn small" onclick="startEditPlan('${plan.id}')">✏️</button>
                    <button class="btn small danger" onclick="deletePlan('${plan.id}')">🗑️</button>
                </div>
            `;
            list.appendChild(li);
        });
}

// === 13. Редактирование плана
function startEditPlan(id) {
    const plan = financialPlans.find(p => p.id === id);
    if (!plan) return;
    document.getElementById('plan-month').value = plan.month;
    document.getElementById('plan-income').value = plan.income;
    document.getElementById('plan-expense').value = plan.expense;
    // Удаляем старый план
    plansCollection.doc(id).delete();
}

// === 14. Ввод плана
document.getElementById('plan-form').addEventListener('submit', e => {
    e.preventDefault();
    const month = document.getElementById('plan-month').value;
    const income = parseFloat(document.getElementById('plan-income').value);
    const expense = parseFloat(document.getElementById('plan-expense').value);
    if (isNaN(income) || isNaN(expense) || !month) {
        alert('Заполните все поля корректно');
        return;
    }
    const exists = financialPlans.find(p => p.month === month);
    if (exists) {
        if (confirm(`План на ${formatMonth(month)} уже существует. Заменить?`)) {
            plansCollection.doc(exists.id).update({ income, expense });
        }
    } else {
        plansCollection.add({ month, income, expense });
    }
    document.getElementById('plan-form').reset();
});

// === 15. Удаление плана
function deletePlan(id) {
    if (confirm('Удалить план?')) {
        plansCollection.doc(id).delete();
    }
}

// === 16. Импорт плана
function importPlanFromExcel() {
    const fileInput = document.getElementById('import-plan-file');
    const file = fileInput.files[0];
    if (!file) {
        alert('Выберите файл');
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            const rows = json.slice(json[0]?.includes('Месяц') ? 1 : 0);
            const batch = db.batch();
            let validCount = 0;
            for (const row of rows) {
                const [month, incomeRaw, expenseRaw] = row;
                if (!month || isNaN(incomeRaw) || isNaN(expenseRaw)) continue;
                let monthFormatted;
                if (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
                    monthFormatted = month;
                } else if (typeof month === 'number') {
                    const date = XLSX.SSF.parse_date_code(month);
                    monthFormatted = `${date.y}-${String(date.m).padStart(2, '0')}`;
                } else {
                    continue;
                }
                const income = parseFloat(incomeRaw);
                const expense = parseFloat(expenseRaw);
                const existing = financialPlans.find(p => p.month === monthFormatted);
                const docRef = existing ? plansCollection.doc(existing.id) : plansCollection.doc();
                batch.set(docRef, { month: monthFormatted, income, expense }, { merge: true });
                validCount++;
            }
            if (validCount === 0) {
                alert('Не удалось распознать данные');
                return;
            }
            batch.commit().then(() => {
                alert(`✅ Успешно импортировано ${validCount} записей`);
                fileInput.value = '';
            });
        } catch (err) {
            console.error(err);
            alert('Ошибка при обработке файла');
        }
    };
    reader.readAsArrayBuffer(file);
}

// === 17. Обновление аналитики
function updateAnalytics() {
    const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
    const savings = income - expense;

    const analyticsIncomeEl = document.getElementById('analytics-income');
    const analyticsExpenseEl = document.getElementById('analytics-expense');
    const analyticsSavingsEl = document.getElementById('analytics-savings');

    if (analyticsIncomeEl) analyticsIncomeEl.textContent = formatNumber(income) + ' ₽';
    if (analyticsExpenseEl) analyticsExpenseEl.textContent = formatNumber(expense) + ' ₽';
    if (analyticsSavingsEl) analyticsSavingsEl.textContent = formatNumber(savings) + ' ₽';

    // Топ-3 статьи расходов
    const expensesByCategory = {};
    transactions
        .filter(t => t.type === 'expense')
        .forEach(t => {
            expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
        });

    const sorted = Object.entries(expensesByCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    const topList = document.getElementById('top-expenses');
    if (topList) {
        topList.innerHTML = '';
        if (sorted.length === 0) {
            const li = document.createElement('li');
            li.style.color = '#999';
            li.style.fontStyle = 'italic';
            li.textContent = 'Нет расходов';
            topList.appendChild(li);
        } else {
            sorted.forEach(([cat, amt]) => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${cat}:</strong> ${formatNumber(amt)} ₽`;
                topList.appendChild(li);
            });
        }
    }

    // План на месяц
    updateMonthlyPlan();

    // BI
    initBI();
}

// === 18. Ежемесячный план
function updateMonthlyPlan() {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const currentMonthEl = document.getElementById('current-month');
    if (currentMonthEl) currentMonthEl.textContent = formatMonth(currentMonth);

    const plan = financialPlans.find(p => p.month === currentMonth);
    const actualIncome = transactions
        .filter(t => t.type === 'income' && t.date.startsWith(currentMonth))
        .reduce((sum, t) => sum + t.amount, 0);
    const actualExpense = transactions
        .filter(t => t.type === 'expense' && t.date.startsWith(currentMonth))
        .reduce((sum, t) => sum + t.amount, 0);

    const plannedIncome = plan ? plan.income : 0;
    const plannedExpense = plan ? plan.expense : 0;

    const planIncomeEl = document.getElementById('plan-income-value');
    const factIncomeEl = document.getElementById('fact-income-value');
    const progressIncomeEl = document.getElementById('progress-income-bar');
    const planExpenseEl = document.getElementById('plan-expense-value');
    const factExpenseEl = document.getElementById('fact-expense-value');
    const progressExpenseEl = document.getElementById('progress-expense-bar');

    if (planIncomeEl) planIncomeEl.textContent = `${formatNumber(plannedIncome)} ₽`;
    if (factIncomeEl) factIncomeEl.textContent = `${formatNumber(actualIncome)} ₽`;
    if (progressIncomeEl) {
        progressIncomeEl.style.width = plannedIncome > 0 ? Math.min(100, (actualIncome / plannedIncome) * 100) + '%' : '0%';
    }

    if (planExpenseEl) planExpenseEl.textContent = `${formatNumber(plannedExpense)} ₽`;
    if (factExpenseEl) factExpenseEl.textContent = `${formatNumber(actualExpense)} ₽`;
    if (progressExpenseEl) {
        progressExpenseEl.style.width = plannedExpense > 0 ? Math.min(100, (actualExpense / plannedExpense) * 100) + '%' : '0%';
    }

    // Накоплено в этом месяце
    const monthlySavings = actualIncome - actualExpense;
    const monthlySavingsEl = document.getElementById('monthly-savings');
    if (monthlySavingsEl) monthlySavingsEl.textContent = formatShort(monthlySavings);
}

// === 19. Формат месяца
function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

// === 20. BI-аналитика: графики
let expensePieChart = null;
let savingsWeeklyChart = null;

function initBI() {
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - 30);

    const biStartEl = document.getElementById('bi-start-date');
    const biEndEl = document.getElementById('bi-end-date');

    if (biStartEl) biStartEl.valueAsDate = startDate;
    if (biEndEl) biEndEl.valueAsDate = today;

    updateBI();
}

function updateBI() {
    const start = document.getElementById('bi-start-date').value;
    const end = document.getElementById('bi-end-date').value;

    if (!start || !end) {
        alert('Выберите обе даты');
        return;
    }
    if (new Date(start) > new Date(end)) {
        alert('Дата начала не может быть позже даты окончания');
        return;
    }

    const filtered = transactions.filter(t => t.date >= start && t.date <= end);

    const balanceAtStart = transactions
        .filter(t => t.date < start)
        .reduce((sum, t) => t.type === 'income' ? sum + t.amount : sum - t.amount, 0);

    const weeklyData = getWeeklySavingsWithStartBalance(filtered, start, end, balanceAtStart);

    updateExpensePieChart(filtered);
    updateSavingsWeeklyChart(weeklyData);
}

// === 21. График роста с начальным балансом
function getWeeklySavingsWithStartBalance(transactions, start, end, initialBalance) {
    const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    const current = new Date(start);
    let weekNum = 1;
    const endDate = new Date(end);
    let cumulativeSavings = initialBalance;
    const result = [];

    result.push({ week: '0', label: 'Начало', savings: cumulativeSavings });

    while (current <= endDate) {
        const weekStart = new Date(current);
        const weekEnd = new Date(current);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (weekEnd > endDate) weekEnd.setTime(endDate.getTime());

        const weekStr = weekStart.toISOString().slice(0, 10);
        const weekEndStr = weekEnd.toISOString().slice(0, 10);

        const weekTransactions = sorted.filter(t => t.date >= weekStr && t.date <= weekEndStr);
        const income = weekTransactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);
        const expense = weekTransactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);
        const weeklySavings = income - expense;

        cumulativeSavings += weeklySavings;
        result.push({
            week: weekNum,
            label: `Неделя ${weekNum}`,
            savings: cumulativeSavings
        });

        weekNum++;
        current.setDate(current.getDate() + 7);
    }

    return result;
}

// === 22. График расходов по категориям
function updateExpensePieChart(transactions) {
    const expensesByCategory = {};
    transactions
        .filter(t => t.type === 'expense')
        .forEach(t => {
            expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
        });

    const categories = Object.keys(expensesByCategory);
    const values = Object.values(expensesByCategory);

    if (expensePieChart) expensePieChart.destroy();

    const ctx = document.getElementById('expensePieChart').getContext('2d');
    expensePieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories,
            datasets: [{
                data: values,
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#7CFC00', '#FFD700', '#8A2BE2']
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

// === 23. График роста накоплений по неделям
function updateSavingsWeeklyChart(weeklyData) {
    const ctx = document.getElementById('savingsWeeklyChart');
    if (!ctx) return;

    if (savingsWeeklyChart) {
        savingsWeeklyChart.destroy();
    }

    const weekLabels = weeklyData.map(w => w.label); // "Неделя 1", "Неделя 2"...

    const chartData = {
        labels: weekLabels,
        datasets: [{
            label: 'Накопления (₽)',
             weeklyData.map(w => w.savings),
            borderColor: '#34c759',
            backgroundColor: 'rgba(52, 199, 89, 0.2)',
            fill: true
        }]
    };

    const options = {
        responsive: true,
        plugins: {
            legend: { position: 'top' }
        },
        scales: {
            y: { beginAtZero: false }
        }
    };

    savingsWeeklyChart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: options
    });
}

// === 24. Авторизация
document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        document.getElementById('auth-error').textContent = 'Введите email и пароль';
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .catch(err => {
            const errorMap = {
                'auth/invalid-credential': 'Неверный email или пароль',
                'auth/user-disabled': 'Пользователь отключён',
                'auth/user-not-found': 'Пользователь не найден',
                'auth/wrong-password': 'Неверный пароль',
                'auth/invalid-email': 'Некорректный email',
                'auth/network-request-failed': 'Ошибка сети. Проверьте подключение'
            };
            const errorMsg = errorMap[err.code] || err.message;
            document.getElementById('auth-error').textContent = errorMsg;
            console.error('Ошибка входа:', err);
        });
});

// === 25. Прослушка состояния аутентификации
auth.onAuthStateChanged(user => {
    if (user) {
        console.log('🟢 Пользователь авторизован:', user.email);
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        loadFromFirebase();
        loadGoalFromFirebase();
        document.getElementById('date').valueAsDate = new Date();
        updateCurrentSectionTitle('home'); // Устанавливаем начальный заголовок
    } else {
        console.log('🔴 Пользователь не авторизован');
        document.getElementById('app').style.display = 'none';
        document.getElementById('auth-screen').style.display = 'block';
    }
});

// === 26. Выход
function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        auth.signOut().then(() => {
            alert('Вы вышли из аккаунта');
        }).catch(err => {
            console.error("Ошибка выхода:", err);
            alert('Не удалось выйти. Попробуйте снова.');
        });
    }
}

// === 27. Тема
function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-theme');
    localStorage.setItem('dark-theme', isDark);
    updateThemeButton(isDark);
}

function updateThemeButton(isDark) {
    const themeIconImg = document.getElementById('theme-icon-img');
    if (themeIconImg) {
        // Инвертируем иконку темы в тёмной теме
        themeIconImg.style.filter = isDark ? 'invert(1)' : 'invert(0)';
    }
}

// === 28. Инициализация темы
document.addEventListener('DOMContentLoaded', () => {
    const isDark = localStorage.getItem('dark-theme') === 'true';
    if (isDark) {
        document.body.classList.add('dark-theme');
    }
    updateThemeButton(isDark);
});

// === 29. Навигация
function show(sectionId) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(sectionId).style.display = 'block';
    document.querySelectorAll('.bottom-nav button').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.bottom-nav button[onclick="show('${sectionId}')"]`).classList.add('active');
    updateCurrentSectionTitle(sectionId);
}

// === 30. Обновление заголовка страницы
function updateCurrentSectionTitle(sectionId) {
    const titleMap = {
        'home': 'Главная',
        'add': 'Добавить',
        'plan': 'План',
        'analytics': 'Отчет',
        'list': 'История'
    };
    const titleEl = document.getElementById('current-section-title');
    if (titleEl) {
        titleEl.textContent = titleMap[sectionId] || 'Бюджет';
    }
}

// === 31. Pull-to-refresh
let startY = 0;
let currentY = 0;
let isPulling = false;
const refreshIndicator = document.getElementById('refresh-indicator');
const body = document.body;

body.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        isPulling = true;
    }
}, { passive: false });

body.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    if (diff > 0) {
        e.preventDefault();
        refreshIndicator.style.opacity = Math.min(1, diff / 100);
    }
}, { passive: false });

body.addEventListener('touchend', () => {
    if (!isPulling) return;
    isPulling = false;
    if (currentY - startY > 80) {
        refreshIndicator.style.opacity = 1;
        refreshData();
    } else {
        refreshIndicator.style.opacity = 0;
    }
});

function refreshData() {
    refreshIndicator.style.opacity = 1;
    loadFromFirebase();
    loadGoalFromFirebase();
    setTimeout(() => {
        refreshIndicator.style.opacity = 0;
    }, 1500);
}

// === 32. История
function renderAllList() {
    const list = document.getElementById('all-transactions');
    if (!list) return;
    list.innerHTML = '';
    const filtered = transactions;
    if (filtered.length === 0) {
        const li = document.createElement('li');
        li.style.color = '#999';
        li.style.fontStyle = 'italic';
        li.textContent = 'Нет операций';
        list.appendChild(li);
        return;
    }
    filtered
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(tx => {
            const li = document.createElement('li');
            const amountColor = tx.type === 'income' ? '#34c759' : '#ff3b30';
            const sign = tx.type === 'income' ? '+' : '-';
            const comment = tx.comment ? `<div class="info">💬 ${tx.comment}</div>` : '';
            li.innerHTML = `
                <div>
                    <div><strong>${tx.category}</strong> <span style="color: ${amountColor}; font-weight: bold;">${sign}${formatNumber(tx.amount)} ₽</span></div>
                    <div class="info">${tx.date} · ${tx.author}</div>
                    ${comment}
                </div>
                <div class="actions">
                    <button class="btn small" onclick="startEdit('${tx.id}')">✏️</button>
                    <button class="btn small danger" onclick="deleteTransaction('${tx.id}')">🗑️</button>
                </div>
            `;
            list.appendChild(li);
        });
}

// === 33. Фильтр по датам
function filterByDate() {
    const start = document.getElementById('filter-start').value;
    const end = document.getElementById('filter-end').value;
    let filtered = transactions;
    if (start) filtered = filtered.filter(t => t.date >= start);
    if (end) filtered = filtered.filter(t => t.date <= end);
    renderAllList(filtered);
}

function clearFilter() {
    document.getElementById('filter-start').value = '';
    document.getElementById('filter-end').value = '';
    renderAllList();
}

// === 34. Экспорт в Excel
function exportToExcel() {
    const start = document.getElementById('filter-start').value;
    const end = document.getElementById('filter-end').value;
    let filtered = [...transactions];
    if (start) filtered = filtered.filter(t => t.date >= start);
    if (end) filtered = filtered.filter(t => t.date <= end);

    if (filtered.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }

    const data = filtered.map(tx => ({
        "Дата": tx.date,
        "Категория": tx.category,
        "Сумма": tx.amount,
        "Тип": tx.type === 'income' ? 'Доход' : 'Расход',
        "Автор": tx.author,
        "Комментарий": tx.comment || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Операции");
    const period = start && end ? `${start}_до_${end}` : "все";
    XLSX.writeFile(wb, `финансы_экспорт_${period}.xlsx`);
}
