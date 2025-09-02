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

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Коллекции
const userTransactions = () => db.collection('users').doc(auth.currentUser.uid).collection('transactions');

// === 2. Глобальные переменные
let transactions = [];
let expensePieChart = null;
let incomePieChart = null;

// === 3. Форматирование чисел
function formatNumber(num) {
    if (isNaN(num) || num === null) return "0";
    return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// === 4. Загрузка данных
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
        renderAllList();
        updateCategoryDatalist();
        updateIncomeTypeDatalist();
    }, error => {
        console.error("Ошибка загрузки транзакций:", error);
        alert("Ошибка загрузки данных. Проверьте подключение.");
    });
}

// === 5. Обновление главной
function updateHome() {
    const balance = getBalance();
    const nextPayday = getNextPayday();
    const daysUntil = Math.max(1, Math.ceil((nextPayday - new Date()) / (1000 * 60 * 60 * 24)));
    const dailyBudget = balance / daysUntil;

    const currentBalance = document.getElementById('current-balance');
    if (currentBalance) currentBalance.textContent = formatNumber(balance) + ' ₽';

    const daysUntilPayday = document.getElementById('days-until-payday');
    if (daysUntilPayday) daysUntilPayday.textContent = daysUntil + ' дней';

    const dailyBudgetEl = document.getElementById('daily-budget');
    if (dailyBudgetEl) dailyBudgetEl.textContent = formatNumber(dailyBudget) + ' ₽';

    const nextPaydayEl = document.getElementById('next-payday');
    if (nextPaydayEl) nextPaydayEl.textContent = nextPayday.toLocaleDateString('ru-RU');
}

// === 6. Баланс
function getBalance() {
    return transactions.reduce((sum, t) => {
        return t.type === 'income' ? sum + t.amount : sum - t.amount;
    }, 0);
}

// === 7. Логика "следующей зарплаты"
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

// === 8. Отображение всех операций
function renderAllList() {
    const list = document.getElementById('all-transactions');
    if (!list) return;
    list.innerHTML = '';
    const start = document.getElementById('filter-start')?.value;
    const end = document.getElementById('filter-end')?.value;
    let filtered = [...transactions];
    if (start) filtered = filtered.filter(t => t.date >= start);
    if (end) filtered = filtered.filter(t => t.date <= end);

    if (filtered.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Нет операций за период';
        li.style.color = '#999';
        list.appendChild(li);
        return;
    }

    filtered.forEach(tx => {
        const li = document.createElement('li');
        const amountColor = tx.type === 'income' ? '#34c759' : '#ff3b30';
        const sign = tx.type === 'income' ? '+' : '-';
        const comment = tx.comment ? `<div class="info">💬 ${escapeHtml(tx.comment)}</div>` : '';
        const incomeType = tx.type === 'income' && tx.incomeType ? `<div class="info">💼 ${escapeHtml(tx.incomeType)}</div>` : '';
        li.innerHTML = `
            <div>
                <div><strong>${escapeHtml(tx.category)}</strong> <span style="color: ${amountColor}; font-weight: bold;">${sign}${formatNumber(tx.amount)} ₽</span></div>
                <div class="info">${tx.date}</div>
                ${incomeType}
                ${comment}
            </div>
            <div class="actions">
                <button class="btn small danger" onclick="deleteTransaction('${tx.id}')">🗑️</button>
            </div>
        `;
        list.appendChild(li);
    });
}

// === 9. Добавление транзакции
document.getElementById('add-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    const type = form.type.value;
    const newTx = {
        date: form.date.value,
        category: form.category.value.trim(),
        amount: parseFloat(form.amount.value),
        type: type,
        comment: form.comment.value.trim() || ''
    };

    if (type === 'income') {
        newTx.incomeType = form['income-type'].value.trim() || 'Без названия';
    }

    if (!newTx.date || !newTx.category || isNaN(newTx.amount) || newTx.amount <= 0) {
        alert('Заполните все обязательные поля корректно');
        return;
    }

    userTransactions().add(newTx)
        .then(() => {
            form.reset();
            document.getElementById('date').valueAsDate = new Date();
            document.getElementById('income-type-field').classList.add('hidden');
            closeModal();
        })
        .catch(err => {
            console.error('Ошибка добавления:', err);
            alert('Ошибка: ' + err.message);
        });
});

// === 10. Удаление транзакции
function deleteTransaction(id) {
    if (confirm('Удалить операцию?')) {
        userTransactions().doc(id).delete()
            .catch(err => {
                console.error('Ошибка удаления:', err);
                alert('Не удалось удалить');
            });
    }
}

// === 11. Статистика: диаграммы и отчёт
function updateAnalytics() {
    // Расходы по категориям
    const expensesByCategory = {};
    transactions
        .filter(t => t.type === 'expense')
        .forEach(t => {
            expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
        });

    const expCategories = Object.keys(expensesByCategory);
    const expValues = Object.values(expensesByCategory);

    // Топ-3 расхода
    const topList = document.getElementById('top-expenses');
    if (topList) {
        topList.innerHTML = '';
        Object.entries(expensesByCategory)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .forEach(([cat, amt]) => {
                const li = document.createElement('li');
                li.textContent = `${cat}: ${formatNumber(amt)} ₽`;
                topList.appendChild(li);
            });
    }

    // Диаграмма расходов
    const expCtx = document.getElementById('expensePieChart');
    if (expCtx) {
        if (expensePieChart) expensePieChart.destroy();
        expensePieChart = new Chart(expCtx, {
            type: 'doughnut',
            data: {
                labels: expCategories,
                datasets: [{
                    data: expValues,
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

    // Доходы по видам
    const incomesByType = {};
    transactions
        .filter(t => t.type === 'income')
        .forEach(t => {
            incomesByType[t.incomeType] = (incomesByType[t.incomeType] || 0) + t.amount;
        });

    const incTypes = Object.keys(incomesByType);
    const incValues = Object.values(incomesByType);

    // Диаграмма доходов
    const incCtx = document.getElementById('incomePieChart');
    if (incCtx) {
        if (incomePieChart) incomePieChart.destroy();
        incomePieChart = new Chart(incCtx, {
            type: 'doughnut',
            data: {
                labels: incTypes,
                datasets: [{
                    data: incValues,
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

// === 12. Фильтры
function filterByDate() {
    renderAllList();
}

function clearFilter() {
    document.getElementById('filter-start').value = '';
    document.getElementById('filter-end').value = '';
    renderAllList();
}

// === 13. Экспорт в Excel
function exportToExcel() {
    const start = document.getElementById('filter-start')?.value;
    const end = document.getElementById('filter-end')?.value;
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
        "Вид дохода": tx.type === 'income' ? tx.incomeType : '',
        "Комментарий": tx.comment || ''
    }));
    try {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Операции");
        const period = start && end ? `${start}_до_${end}` : "все";
        const filename = `бюджет_до_зарплаты_${period}.xlsx`;
        XLSX.writeFile(wb, filename);
    } catch (err) {
        console.error('Ошибка экспорта:', err);
        alert('Не удалось экспортировать данные в Excel');
    }
}

// === 14. Модальное окно
function showAddModal() {
    document.getElementById('add-modal').classList.remove('hidden');
    document.getElementById('date').valueAsDate = new Date();
    const typeSelect = document.getElementById('type');
    const incomeTypeField = document.getElementById('income-type-field');
    typeSelect.onchange = () => {
        if (typeSelect.value === 'income') {
            incomeTypeField.classList.remove('hidden');
        } else {
            incomeTypeField.classList.add('hidden');
        }
    };
    if (typeSelect.value === 'income') {
        incomeTypeField.classList.remove('hidden');
    }
}

function closeModal() {
    document.getElementById('add-modal').classList.add('hidden');
    document.getElementById('add-form').reset();
}

// === 15. Datalist
function updateCategoryDatalist() {
    const categories = [...new Set(transactions.map(t => t.category))];
    const datalist = document.getElementById('categories');
    datalist.innerHTML = '';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        datalist.appendChild(option);
    });
}

function updateIncomeTypeDatalist() {
    const incomeTypes = [...new Set(transactions.filter(t => t.type === 'income').map(t => t.incomeType || 'Без названия'))];
    const datalist = document.getElementById('income-types');
    datalist.innerHTML = '';
    incomeTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        datalist.appendChild(option);
    });
}

// === 16. Форма входа
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorElement.textContent = 'Неверный формат email';
        return;
    }

    if (password.length < 6) {
        errorElement.textContent = 'Пароль должен быть не менее 6 символов';
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            if (!user.emailVerified) {
                alert('Подтвердите email, прежде чем входить.');
                auth.signOut();
                return;
            }
            console.log("✅ Вход выполнен:", user.email);
        })
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

// === 17. Аутентификация
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log('✅ Вошёл:', user.email);
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        loadFromFirebase();
        show('home');
        if (document.getElementById('date')) {
            document.getElementById('date').valueAsDate = new Date();
        }
    } else {
        console.log('❌ Не авторизован');
        document.getElementById('app').classList.add('hidden');
        document.getElementById('auth-screen').classList.remove('hidden');
    }
});

// === 18. Выход
function logout() {
    if (confirm('Выйти?')) {
        auth.signOut().then(() => {
            console.log("Выход выполнен");
        }).catch(err => {
            console.error('Ошибка выхода:', err);
            alert('Не удалось выйти');
        });
    }
}

// === 19. Навигация
function show(sectionId) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(sectionId).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.nav-btn[onclick="show('${sectionId}')"]`).classList.add('active');
    if (sectionId === 'list') renderAllList();
    if (sectionId === 'analytics') updateAnalytics();
}

// === 20. Тема
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('dark-theme', document.body.classList.contains('dark-theme'));
}

// === 21. Инициализация
document.addEventListener('DOMContentLoaded', () => {
    const isDark = localStorage.getItem('dark-theme') === 'true';
    if (isDark) document.body.classList.add('dark-theme');
    if (document.getElementById('date')) {
        document.getElementById('date').valueAsDate = new Date();
    }
});

// === 22. Pull-to-refresh
let startY = 0, currentY = 0;
const refreshIndicator = document.getElementById('refresh-indicator');
document.body.addEventListener('touchstart', e => {
    if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
    }
}, { passive: false });
document.body.addEventListener('touchmove', e => {
    currentY = e.touches[0].clientY;
    if (currentY - startY > 0) {
        e.preventDefault();
        refreshIndicator.style.opacity = Math.min(1, (currentY - startY) / 100);
    }
}, { passive: false });
document.body.addEventListener('touchend', () => {
    if (currentY - startY > 80) {
        refreshIndicator.style.opacity = 1;
        loadFromFirebase();
        setTimeout(() => refreshIndicator.style.opacity = 0, 1500);
    } else {
        refreshIndicator.style.opacity = 0;
    }
});

// === 23. Утилиты
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
