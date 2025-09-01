// === 1. Firebase Config
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// Коллекции
const userTransactions = () => collection(db, 'users', auth.currentUser.uid, 'transactions');

// === 2. Глобальные переменные
let transactions = [];
let expensePieChart = null;

// === 3. Форматирование чисел
function formatNumber(num) {
    if (isNaN(num) || num === null) return "0";
    return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// === 4. Загрузка данных
function loadFromFirebase() {
    const q = query(userTransactions(), orderBy('date', 'desc'));
    onSnapshot(q, (snapshot) => {
        transactions = [];
        snapshot.forEach(doc => {
            transactions.push({ id: doc.id, ...doc.data() });
        });
        updateHome();
        updateAnalytics();
        renderRecentList();
        if (document.getElementById('list') && document.getElementById('list').style.display !== 'none') {
            renderAllList();
        }
    }, error => {
        console.error("Ошибка загрузки транзакций:", error);
        alert("Ошибка загрузки данных. Проверьте подключение.");
    });
}

// === 5. Обновление главной: остаток до зарплаты
function updateHome() {
    const balance = getBalance();
    const nextPayday = getNextPayday();
    const daysUntil = Math.max(1, Math.ceil((nextPayday - new Date()) / (1000 * 60 * 60 * 24)));
    const dailyBudget = balance / daysUntil;

    document.getElementById('current-balance').textContent = formatNumber(balance) + ' ₽';
    document.getElementById('days-until-payday').textContent = daysUntil + ' дней';
    document.getElementById('daily-budget').textContent = formatNumber(dailyBudget) + ' ₽';
    document.getElementById('next-payday').textContent = nextPayday.toLocaleDateString('ru-RU');
}

// === 6. Расчёт баланса
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

    // Проверяем текущий месяц: ищем последний рабочий день до 20 числа
    let targetMonth = new Date(year, month, 20);
    while (targetMonth > today && targetMonth.getDate() > 20) {
        targetMonth.setDate(targetMonth.getDate() - 1);
    }

    // Ищем последний рабочий день (пн-пт) до 20
    while (targetMonth.getDay() === 0 || targetMonth.getDay() === 6) {
        targetMonth.setDate(targetMonth.getDate() - 1);
    }

    // Если уже прошло 20 — переходим к следующему месяцу, до 5 числа
    if (targetMonth < today) {
        const nextMonth = new Date(year, month + 1, 5);
        targetMonth = new Date(year, month + 1, 5);
        while (targetMonth.getDay() === 0 || targetMonth.getDay() === 6) {
            targetMonth.setDate(targetMonth.getDate() - 1);
        }
    }

    return targetMonth;
}

// === 8. Последние 10 транзакций
function renderRecentList() {
    const list = document.getElementById('recent-transactions');
    if (!list) return;
    list.innerHTML = '';
    const recent = transactions.slice(0, 10);
    if (recent.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Нет операций';
        li.style.color = '#999';
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
                <div class="info">${tx.date}</div>
                ${comment}
            </div>
            <div class="actions">
                <button class="btn small danger" onclick="deleteTransaction('${tx.id}')">🗑️</button>
            </div>
        `;
        list.appendChild(li);
    });
}

// === 9. Добавление транзакции (через модальное окно)
document.getElementById('add-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    const newTx = {
        date: form.date.value,
        category: form.category.value,
        amount: parseFloat(form.amount.value),
        type: form.type.value,
        comment: form.comment.value || ''
    };

    if (!newTx.date || !newTx.category || isNaN(newTx.amount) || newTx.amount <= 0) {
        alert('Заполните все обязательные поля');
        return;
    }

    addDoc(userTransactions(), newTx)
        .then(() => {
            form.reset();
            document.getElementById('date').valueAsDate = new Date();
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
        deleteDoc(doc(db, 'users', auth.currentUser.uid, 'transactions', id))
            .catch(err => {
                console.error('Ошибка удаления:', err);
                alert('Не удалось удалить');
            });
    }
}

// === 11. Статистика: кольцевая диаграмма
function updateAnalytics() {
    const expensesByCategory = {};
    transactions
        .filter(t => t.type === 'expense')
        .forEach(t => {
            expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
        });

    const categories = Object.keys(expensesByCategory);
    const values = Object.values(expensesByCategory);

    // Топ-3 расхода
    const sorted = Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topList = document.getElementById('top-expenses');
    if (topList) {
        topList.innerHTML = '';
        sorted.forEach(([cat, amt]) => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${cat}:</strong> ${formatNumber(amt)} ₽`;
            topList.appendChild(li);
        });
    }

    // Диаграмма
    const ctx = document.getElementById('expensePieChart');
    if (!ctx) return;
    if (expensePieChart) expensePieChart.destroy();

    expensePieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories,
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

// === 12. История операций
function renderAllList() {
    const list = document.getElementById('all-transactions');
    if (!list) return;
    list.innerHTML = '';
    const start = document.getElementById('filter-start')?.value;
    const end = document.getElementById('filter-end')?.value;

    let filtered = transactions;
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
        const comment = tx.comment ? `<div class="info">💬 ${tx.comment}</div>` : '';
        li.innerHTML = `
            <div>
                <div><strong>${tx.category}</strong> <span style="color: ${amountColor}; font-weight: bold;">${sign}${formatNumber(tx.amount)} ₽</span></div>
                <div class="info">${tx.date}</div>
                ${comment}
            </div>
            <div class="actions">
                <button class="btn small danger" onclick="deleteTransaction('${tx.id}')">🗑️</button>
            </div>
        `;
        list.appendChild(li);
    });
}

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
}

function closeModal() {
    document.getElementById('add-modal').classList.add('hidden');
    document.getElementById('add-form').reset();
}

// === 15. Авторизация
document.getElementById('login-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    signInWithEmailAndPassword(auth, email, password)
        .then(() => {
            document.getElementById('auth-error').textContent = '';
        })
        .catch(err => {
            document.getElementById('auth-error').textContent = err.message;
        });
});

// === 16. Прослушка аутентификации
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log('Вошёл:', user.email);
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        loadFromFirebase();
        show('home');
        if (document.getElementById('date')) {
            document.getElementById('date').valueAsDate = new Date();
        }
    } else {
        document.getElementById('app').classList.add('hidden');
        document.getElementById('auth-screen').classList.remove('hidden');
    }
});

// === 17. Выход
function logout() {
    if (confirm('Выйти?')) {
        signOut(auth).catch(err => {
            console.error('Ошибка выхода:', err);
            alert('Не удалось выйти');
        });
    }
}

// === 18. Навигация
function show(sectionId) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(sectionId).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.nav-btn[onclick="show('${sectionId}')"]`).classList.add('active');
    if (sectionId === 'list') renderAllList();
    if (sectionId === 'analytics') updateAnalytics();
}

// === 19. Тема
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('dark-theme', document.body.classList.contains('dark-theme'));
}

// === 20. Инициализация
document.addEventListener('DOMContentLoaded', () => {
    const isDark = localStorage.getItem('dark-theme') === 'true';
    if (isDark) document.body.classList.add('dark-theme');
    document.getElementById('date').valueAsDate = new Date();
});

// === 21. Pull-to-refresh
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