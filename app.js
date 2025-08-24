// === app.js — Полная версия с исправлениями

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
        if (document.getElementById('list').style.display !== 'none') {
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
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const savings = income - expense;
    const progress = savingsGoal > 0 ? Math.min(100, (savings / savingsGoal) * 100) : 0;

    document.getElementById('total-savings').textContent = formatNumber(savings) + ' ₽';
    document.getElementById('progress-fill').style.width = progress + '%';
    document.getElementById('progress-text').textContent = `${Math.round(progress)}% от цели (${formatNumber(savings)} / ${formatNumber(savingsGoal)} ₽)`;
    document.getElementById('progress-fill').style.background = savings >= savingsGoal ? '#34c759' : '#007AFF';
    document.getElementById('total-income').textContent = formatNumber(income) + ' ₽';
    document.getElementById('total-expense').textContent = formatNumber(expense) + ' ₽';
}

// === 8. Последние 10 операций
function renderRecentList() {
    const list = document.getElementById('recent-transactions');
    list.innerHTML = '';
    const recent = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
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
            if (document.getElementById('list').style.display !== 'none') {
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
            if (document.getElementById('list').style.display !== 'none') {
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
    list.innerHTML = '';
    if (financialPlans.length === 0) {
        const li = document.createElement('li');
        li.style.color = '#999';
        li.style.fontStyle = 'italic';
        li.textContent = 'Пока нет планов';
        list.appendChild(li);
        return;
    }
    financialPlans.sort((a, b) => a.month.localeCompare(b.month)).forEach(plan => {
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
    const month = document.getElementById('plan-month');
    const income = document.getElementById('plan-income');
    const expense = document.getElementById('plan-expense');
    month.value = plan.month;
    income.value = plan.income;
    expense.value = plan.expense;
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
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const savings = income - expense;

    document.getElementById('analytics-income').textContent = formatNumber(income) + ' ₽';
    document.getElementById('analytics-expense').textContent = formatNumber(expense) + ' ₽';
    document.getElementById('analytics-savings').textContent = formatNumber(savings) + ' ₽';

    // Топ-3 расходов
    const expensesByCategory = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
        expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
    });
    const sorted = Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topList = document.getElementById('top-expenses');
    topList.innerHTML = '';
    sorted.forEach(([cat, amt]) => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${cat}:</strong> ${formatNumber(amt)} ₽`;
        topList.appendChild(li);
    });

    // План на месяц
    updateMonthlyPlan();

    // BI
    initBI();
}

// === 18. Ежемесячный план
function updateMonthlyPlan() {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    document.getElementById('current-month').textContent = formatMonth(currentMonth);

    const plan = financialPlans.find(p => p.month === currentMonth);
    const actualIncome = transactions.filter(t => t.type === 'income' && t.date.startsWith(currentMonth)).reduce((sum, t) => sum + t.amount, 0);
    const actualExpense = transactions.filter(t => t.type === 'expense' && t.date.startsWith(currentMonth)).reduce((sum, t) => sum + t.amount, 0);

    const plannedIncome = plan ? plan.income : 0;
    const plannedExpense = plan ? plan.expense : 0;

    document.getElementById('plan-income-value').textContent = `${formatNumber(plannedIncome)} ₽`;
    document.getElementById('fact-income-value').textContent = `${formatNumber(actualIncome)} ₽`;
    document.getElementById('progress-income-bar').style.width = plannedIncome > 0 ? Math.min(100, (actualIncome / plannedIncome) * 100) + '%' : '0%';

    document.getElementById('plan-expense-value').textContent = `${formatNumber(plannedExpense)} ₽`;
    document.getElementById('fact-expense-value').textContent = `${formatNumber(actualExpense)} ₽`;
    document.getElementById('progress-expense-bar').style.width = plannedExpense > 0 ? Math.min(100, (actualExpense / plannedExpense) * 100) + '%' : '0%';

    // Накоплено в этом месяце
    const monthlySavings = actualIncome - actualExpense;
    document.getElementById('monthly-savings').textContent = formatShort(monthlySavings);
}

// === 19. Формат месяца
function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

// === 20. BI-графики
let expensePieChart = null;
let savingsWeeklyChart = null;

function initBI() {
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - 30);
    document.getElementById('bi-start-date').valueAsDate = startDate;
    document.getElementById('bi-end-date').valueAsDate = today;
    updateBI();
}

function updateBI() {
    const start = document.getElementById('bi-start-date').value;
    const end = document.getElementById('bi-end-date').value;
    if (!start || !end) return;
    if (new Date(start) > new Date(end)) return;

    const filtered = transactions.filter(t => t.date >= start && t.date <= end);

    // Баланс на начало периода
    const balanceAtStart = transactions.filter(t => t.date < start).reduce((sum, t) => t.type === 'income' ? sum + t.amount : sum - t.amount, 0);

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
        const income = weekTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const expense = weekTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
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

// === 22. График расходов
function updateExpensePieChart(transactions) {
    if (expensePieChart) expensePieChart.destroy();
    const expensesByCategory = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
        expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
    });
    const categories = Object.keys(expensesByCategory);
    const values = Object.values(expensesByCategory);
    const ctx = document.getElementById('expensePieChart').getContext('2d');
    expensePieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories,
            datasets: [{
                values,
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#7CFC00', '#FFD700', '#8A2BE2']
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

// === 23. График роста
function updateSavingsWeeklyChart(weeklyData) {
    if (savingsWeeklyChart) savingsWeeklyChart.destroy();
    const weekLabels = weeklyData.map(w => w.label);
    const weekSavings = weeklyData.map(w => w.savings);
    const ctx = document.getElementById('savingsWeeklyChart').getContext('2d');
    savingsWeeklyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: weekLabels,
            datasets: [{
                label: 'Накопления (₽)',
                data: weekSavings,
                borderColor: '#34c759',
                backgroundColor: 'rgba(52, 199, 89, 0.2)',
                fill: true
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: false } } }
    });
}

// === 24. Авторизация
document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    auth.signInWithEmailAndPassword(email, password)
        .catch(err => document.getElementById('auth-error').textContent = err.message);
});

// === 25. Прослушка аутентификации
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        loadFromFirebase();
        loadGoalFromFirebase();
        document.getElementById('date').valueAsDate = new Date();
    } else {
        document.getElementById('app').style.display = 'none';
        document.getElementById('auth-screen').style.display = 'block';
    }
});

// === 26. Выход
function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        auth.signOut();
    }
}

// === 27. Тема
function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-theme');
    localStorage.setItem('dark-theme', isDark);
    document.querySelector('.theme-toggle').textContent = isDark ? '☀️' : '🌙';
}

// === 28. Инициализация темы
document.addEventListener('DOMContentLoaded', () => {
    const isDark = localStorage.getItem('dark-theme') === 'true';
    if (isDark) {
        document.body.classList.add('dark-theme');
        document.querySelector('.theme-toggle').textContent = '☀️';
    }
});

// === 29. Навигация
function show(sectionId) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(sectionId).style.display = 'block';
    document.querySelectorAll('.bottom-nav button').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.bottom-nav button[onclick="show('${sectionId}')"]`).classList.add('active');
}

// === 30. Pull-to-refresh
let startY = 0;
let currentY = 0;
let isPulling = false;
const refreshIndicator = document.getElementById('refresh-indicator');

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
        refreshIndicator.style.opacity = Math.min(1, diff / 100);
    }
}, { passive: false });

document.body.addEventListener('touchend', () => {
    if (!isPulling) return;
    isPulling = false;
    if (currentY - startY > 80) {
        refreshIndicator.style.opacity = 1;
        loadFromFirebase();
        loadGoalFromFirebase();
        setTimeout(() => refreshIndicator.style.opacity = 0, 1500);
    } else {
        refreshIndicator.style.opacity = 0;
    }
});

// === 31. История
function renderAllList(filtered = transactions) {
    const list = document.getElementById('all-transactions');
    list.innerHTML = '';
    const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(tx => {
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

// === 32. Экспорт
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
