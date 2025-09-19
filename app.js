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
let editingPlanId = null;
// Глобальные переменные для графиков
let expensePieChart = null;
let savingsWeeklyChart = null;
// === 3. Централизованное получение курса доллара с кэшированием
let cachedUsdRate = null; // Теперь будет объект { rate, date }
let cachedUsdRateTime = null;
let usdRatePromise = null;
function getUsdRateCached() {
    if (!usdRatePromise) {
        usdRatePromise = getUsdRate().finally(() => {
            usdRatePromise = null;
        });
    }
    return usdRatePromise;
}
async function getUsdRate() {
    // ✅ ИСПРАВЛЕНО: Кэшируем на 24 часа, а не на 10 минут
    const CACHE_DURATION = 24 * 60 * 60 * 1000;
    if (cachedUsdRate && cachedUsdRate.rate && (Date.now() - cachedUsdRateTime) < CACHE_DURATION) {
        return cachedUsdRate;
    }
    try {
        const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const rate = data.Valute.USD.Value;
        const dateStr = data.Date; // Дата в формате ISO 8601
        const dateObj = new Date(dateStr);
        const formattedDate = dateObj.toLocaleDateString('ru-RU'); // Форматируем дату

        const result = { rate, date: formattedDate };
        cachedUsdRate = result; // Сохраняем объект
        cachedUsdRateTime = Date.now();
        return result;
    } catch (error) {
        console.error('Ошибка получения курса доллара:', error);
        if (cachedUsdRate) return cachedUsdRate;
        throw error;
    }
}
// === 4. Форматирование чисел
function formatNumber(num) {
    if (isNaN(num) || num === null) return "0";
    return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
function formatShort(num) {
    if (isNaN(num) || num === null) return "0";
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + " тыс. р.";
}
// === 5. Функция для создания элемента списка транзакции
function createTransactionListItem(tx) {
    const li = document.createElement('li');
    const amountColor = tx.type === 'income' ? '#34c759' : '#ff3b30';
    const sign = tx.type === 'income' ? '+' : '-';
    const comment = tx.comment ? `<div class="info">💬 ${tx.comment}</div>` : '';
    const currencySymbol = tx.isDollarSavings ? '$' : '₽';
    li.innerHTML = `
        <div>
            <div><strong>${tx.category}</strong> <span style="color: ${amountColor}; font-weight: bold;">${sign}${formatNumber(tx.amount)} ${currencySymbol}</span></div>
            <div class="info">${tx.date} · ${tx.author}</div>
            ${comment}
        </div>
        <div class="actions">
            <button class="btn small" onclick="startEdit('${tx.id}')" aria-label="Редактировать ${tx.category}">
                <img src="icons/edit.png" alt="Редактировать" class="action-icon">
            </button>
            <button class="btn small danger" onclick="deleteTransaction('${tx.id}')" aria-label="Удалить ${tx.category}">
                <img src="icons/delete.png" alt="Удалить" class="action-icon">
            </button>
        </div>
    `;
    return li;
}
// === 6. Загрузка цели
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
    }, error => {
        console.error("Ошибка загрузки цели:", error);
    });
}
// === 7. Сохранение цели
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
// === 8. Загрузка данных
function loadFromFirebase() {
    showLoadingIndicator(true);
    let isFirstLoad = true;
    transactionsCollection.orderBy('date', 'desc').onSnapshot(snapshot => {
        transactions = [];
        snapshot.forEach(doc => {
            transactions.push({ id: doc.id, ...doc.data() });
        });
        updateUIDebounced();
        if (isFirstLoad) {
            isFirstLoad = false;
            if (document.getElementById('date')) {
                document.getElementById('date').valueAsDate = new Date();
            }
            show('home');
            showLoadingIndicator(false);
            // ✅ ИСПРАВЛЕНО: Сбрасываем кэш курса при первом запуске приложения
            cachedUsdRate = null;
            updateDollarSavings();
        }
    }, error => {
        console.error("Ошибка загрузки транзакций:", error);
        alert("Ошибка загрузки данных. Проверьте подключение к интернету.");
        showLoadingIndicator(false);
    });
    plansCollection.onSnapshot(snapshot => {
        financialPlans = [];
        snapshot.forEach(doc => {
            financialPlans.push({ id: doc.id, ...doc.data() });
        });
        renderPlanList();
        updateAnalytics();
    }, error => {
        console.error("Ошибка загрузки планов:", error);
    });
}
// === 9. Обновление выпадающих списков
function updateDropdowns() {
    const regularTransactions = transactions.filter(t => !t.isDollarSavings);
    const categories = [...new Set(regularTransactions.map(t => t.category))].sort();
    const authors = [...new Set(regularTransactions.map(t => t.author))].sort();
    const updateSelect = (selectId, values) => {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '';
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            select.appendChild(option);
        });
    };
    updateSelect('categories', categories);
    updateSelect('edit-categories', categories);
    updateSelect('authors', authors);
    updateSelect('edit-authors', authors);
}
// === 10. Обновление главной
function updateHome() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const regularTransactions = transactions.filter(t => !t.isDollarSavings);
    const monthIncome = regularTransactions
        .filter(t => t.type === 'income' && t.date.startsWith(currentMonth))
        .reduce((sum, t) => sum + t.amount, 0);
    const monthExpense = regularTransactions
        .filter(t => t.type === 'expense' && t.date.startsWith(currentMonth))
        .reduce((sum, t) => sum + t.amount, 0);
    const totalRubleSavings = regularTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0) - regularTransactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);
    let totalDollarInRub = 0;
    getUsdRateCached()
        .then(usdData => { // Изменено: принимаем объект { rate, date }
            const usdRate = usdData.rate;
            const dollarTransactions = transactions.filter(t => t.isDollarSavings);
            const totalDollarAmount = dollarTransactions.reduce((sum, t) => {
                return t.type === 'income' ? sum + t.amount : sum - t.amount;
            }, 0);
            totalDollarInRub = totalDollarAmount * usdRate;
            const totalAllSavings = totalRubleSavings + totalDollarInRub;
            if (document.getElementById('total-savings')) {
                document.getElementById('total-savings').textContent = formatNumber(totalAllSavings) + ' ₽';
            }
        })
        .catch(error => {
            console.error('Ошибка получения курса доллара:', error);
            if (document.getElementById('total-savings')) {
                document.getElementById('total-savings').textContent = formatNumber(totalRubleSavings) + ' ₽';
            }
        })
        .finally(() => {
            if (document.getElementById('ruble-savings-amount')) {
                document.getElementById('ruble-savings-amount').textContent = formatNumber(totalRubleSavings) + ' ₽';
            }
            const rubleProgress = savingsGoal > 0 ? Math.min(100, (totalRubleSavings / savingsGoal) * 100) : 0;
            if (document.getElementById('ruble-progress-fill')) {
                document.getElementById('ruble-progress-fill').style.width = rubleProgress + '%';
            }
            if (document.getElementById('ruble-progress-text')) {
                document.getElementById('ruble-progress-text').textContent = `${Math.round(rubleProgress)}% от цели`;
            }
        });
    if (document.getElementById('monthly-income')) {
        document.getElementById('monthly-income').textContent = formatNumber(monthIncome) + ' ₽';
    }
    if (document.getElementById('monthly-expense')) {
        document.getElementById('monthly-expense').textContent = formatNumber(monthExpense) + ' ₽';
    }
}
// === 11. Обновление блока "Долларовые накопления"
function updateDollarSavings(cachedUsdData = null) { // Новый параметр для оптимизации
    const usdPromise = cachedUsdData ? Promise.resolve(cachedUsdData) : getUsdRateCached();

    usdPromise
        .then(usdData => { // Изменено: принимаем объект { rate, date }
            const usdRate = usdData.rate;
            const usdDate = usdData.date; // Получаем дату
            const dollarTransactions = transactions.filter(t => t.isDollarSavings);
            const totalDollarAmount = dollarTransactions.reduce((sum, t) => {
                return t.type === 'income' ? sum + t.amount : sum - t.amount;
            }, 0);
            const totalRubAmount = totalDollarAmount * usdRate;
            if (document.getElementById('dollar-savings-amount')) {
                document.getElementById('dollar-savings-amount').textContent = formatNumber(totalDollarAmount) + ' $';
            }
            if (document.getElementById('dollar-savings-rub')) {
                document.getElementById('dollar-savings-rub').textContent = formatNumber(totalRubAmount) + ' ₽';
            }
            if (document.getElementById('dollar-rate')) {
                // Изменено: отображаем курс и дату
                document.getElementById('dollar-rate').textContent = `Курс: ${usdRate.toFixed(2)} ₽/$ от ${usdDate}`;
            }
        })
        .catch(error => {
            console.error('Ошибка получения курса доллара:', error);
            const dollarTransactions = transactions.filter(t => t.isDollarSavings);
            const totalDollarAmount = dollarTransactions.reduce((sum, t) => {
                return t.type === 'income' ? sum + t.amount : sum - t.amount;
            }, 0);
            if (document.getElementById('dollar-savings-amount')) {
                document.getElementById('dollar-savings-amount').textContent = formatNumber(totalDollarAmount) + ' $';
            }
            if (document.getElementById('dollar-savings-rub')) {
                document.getElementById('dollar-savings-rub').textContent = 'Ошибка загрузки курса';
            }
            if (document.getElementById('dollar-rate')) {
                document.getElementById('dollar-rate').textContent = 'Курс: неизвестен';
            }
        });
}
// === 12. Последние 10 операций
function renderRecentList() {
    const list = document.getElementById('recent-transactions');
    if (!list) return;
    if (!transactions || !Array.isArray(transactions)) {
        list.innerHTML = '<li style="color: #999;">Загрузка...</li>';
        return;
    }
    list.innerHTML = '';
    const recent = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
    if (recent.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Нет операций';
        li.style.color = '#999';
        list.appendChild(li);
        return;
    }
    recent.forEach(tx => {
        list.appendChild(createTransactionListItem(tx));
    });
}
// === 13. Добавление операции
document.getElementById('add-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    const newTx = {
        date: form.date.value,
        category: form.category.value,
        amount: parseFloat(form.amount.value),
        type: form.type.value,
        author: form.author.value,
        comment: form.comment.value || '',
        isDollarSavings: form['dollar-savings']?.checked || false
    };
    if (!newTx.date || !newTx.category || isNaN(newTx.amount) || newTx.amount <= 0 || !newTx.author) {
        alert('Заполните все обязательные поля корректно');
        return;
    }
    transactionsCollection.add(newTx)
        .then(() => {
            form.reset();
            document.getElementById('date').valueAsDate = new Date();
            // renderRecentList(); // Оптимизация: вызов через updateUIDebounced
            // if (isSectionActive('list')) {
            //     renderAllListDebounced(); // Оптимизация: вызов через updateUIDebounced
            // }
            // if (newTx.isDollarSavings) {
            //     updateDollarSavings(); // Оптимизация: вызов через updateUIDebounced
            //     updateHome(); // Оптимизация: вызов через updateUIDebounced
            // }
            updateUIDebounced(); // Вызовет все необходимые обновления с debounce
        })
        .catch(err => {
            console.error('Ошибка добавления операции:', err);
            alert('Ошибка: ' + err.message);
        });
});
// === 14. Редактирование операции
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
    if (document.getElementById('edit-dollar-savings')) {
        document.getElementById('edit-dollar-savings').checked = tx.isDollarSavings || false;
    }
    document.getElementById('edit-form').style.display = 'block';
}
document.getElementById('edit-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    const id = form['edit-id'].value;
    const updatedTx = {
        date: form['edit-date'].value,
        category: form['edit-category'].value,
        amount: parseFloat(form['edit-amount'].value),
        type: form['edit-type'].value,
        author: form['edit-author'].value,
        comment: form['edit-comment'].value || '',
        isDollarSavings: form['edit-dollar-savings']?.checked || false
    };
    if (!updatedTx.date || !updatedTx.category || isNaN(updatedTx.amount) || updatedTx.amount <= 0 || !updatedTx.author) {
        alert('Заполните все обязательные поля корректно');
        return;
    }
    transactionsCollection.doc(id).update(updatedTx)
        .then(() => {
            document.getElementById('edit-form').style.display = 'none';
            form.reset();
            // renderRecentList(); // Оптимизация: вызов через updateUIDebounced
            // if (isSectionActive('list')) {
            //     renderAllListDebounced(); // Оптимизация: вызов через updateUIDebounced
            // }
            // updateDollarSavings(); // Оптимизация: вызов через updateUIDebounced
            // updateHome(); // Оптимизация: вызов через updateUIDebounced
            updateUIDebounced(); // Вызовет все необходимые обновления с debounce
        })
        .catch(err => {
            console.error('Ошибка обновления операции:', err);
            alert('Ошибка: ' + err.message);
        });
});
function cancelEdit() {
    document.getElementById('edit-form').style.display = 'none';
    document.getElementById('edit-form').reset();
}
// === 15. Удаление операции
function deleteTransaction(id) {
    if (confirm('Удалить операцию?')) {
        const txToDelete = transactions.find(t => t.id === id);
        transactionsCollection.doc(id).delete()
            .then(() => {
                // renderRecentList(); // Оптимизация: вызов через updateUIDebounced
                // if (isSectionActive('list')) {
                //     renderAllListDebounced(); // Оптимизация: вызов через updateUIDebounced
                // }
                // if (txToDelete && txToDelete.isDollarSavings) {
                //     updateDollarSavings(); // Оптимизация: вызов через updateUIDebounced
                //     updateHome(); // Оптимизация: вызов через updateUIDebounced
                // }
                updateUIDebounced(); // Вызовет все необходимые обновления с debounce
            })
            .catch(err => {
                console.error('Ошибка удаления операции:', err);
                alert('Не удалось удалить операцию');
            });
    }
}
// === 16. Финансовый план
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
    financialPlans.sort((a, b) => a.month.localeCompare(b.month)).forEach(plan => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div>
                <div><strong>${formatMonth(plan.month)}</strong></div>
                <div class="info">Доход: ${formatNumber(plan.income)} ₽ · Расход: ${formatNumber(plan.expense)} ₽</div>
            </div>
            <div class="actions">
                <button class="btn small" onclick="startEditPlan('${plan.id}')" aria-label="Редактировать план на ${formatMonth(plan.month)}">
                    <img src="icons/edit.png" alt="Редактировать" class="action-icon">
                </button>
                <button class="btn small danger" onclick="deletePlan('${plan.id}')" aria-label="Удалить план на ${formatMonth(plan.month)}">
                    <img src="icons/delete.png" alt="Удалить" class="action-icon">
                </button>
            </div>
        `;
        list.appendChild(li);
    });
}
// === 17. Редактирование плана
function startEditPlan(id) {
    const plan = financialPlans.find(p => p.id === id);
    if (!plan) return;
    editingPlanId = id;
    document.getElementById('plan-month').value = plan.month;
    document.getElementById('plan-income').value = plan.income;
    document.getElementById('plan-expense').value = plan.expense;
}
// === 18. Ввод плана
document.getElementById('plan-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const month = document.getElementById('plan-month').value;
    const income = parseFloat(document.getElementById('plan-income').value);
    const expense = parseFloat(document.getElementById('plan-expense').value);
    if (isNaN(income) || isNaN(expense) || !month) {
        alert('Заполните все поля корректно');
        return;
    }
    if (editingPlanId) {
        plansCollection.doc(editingPlanId).update({ month, income, expense })
            .then(() => {
                editingPlanId = null;
                document.getElementById('plan-form').reset();
            })
            .catch(err => {
                console.error('Ошибка обновления плана:', err);
                alert('Не удалось обновить план');
            });
    } else {
        const exists = financialPlans.find(p => p.month === month);
        if (exists) {
            if (confirm(`План на ${formatMonth(month)} уже существует. Заменить?`)) {
                plansCollection.doc(exists.id).update({ income, expense });
            }
        } else {
            plansCollection.add({ month, income, expense });
        }
        document.getElementById('plan-form').reset();
    }
});
// === 19. Удаление плана
function deletePlan(id) {
    if (confirm('Удалить план?')) {
        plansCollection.doc(id).delete()
            .catch(err => {
                console.error('Ошибка удаления плана:', err);
                alert('Не удалось удалить план');
            });
    }
}
// === 20. Импорт
function importPlanFromExcel() {
    const fileInput = document.getElementById('import-plan-file');
    const file = fileInput.files[0];
    if (!file) {
        alert('Выберите файл');
        return;
    }
    const MAX_ROWS = 1000;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            const rows = json.slice(json[0]?.includes('Месяц') ? 1 : 0);
            if (rows.length > MAX_ROWS) {
                alert(`Файл содержит слишком много строк (максимум ${MAX_ROWS}).`);
                return;
            }
            const batch = db.batch();
            let validCount = 0;
            for (const row of rows) {
                const [month, incomeRaw, expenseRaw] = row;
                if (!month || isNaN(incomeRaw) || isNaN(expenseRaw)) continue;
                let monthFormatted;
                if (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
                    monthFormatted = month;
                } else if (typeof month === 'number') {
                    const date = new Date((month - 25569) * 86400 * 1000);
                    monthFormatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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
            }).catch(err => {
                console.error('Ошибка импорта:', err);
                alert('Ошибка при импорте данных');
            });
        } catch (err) {
            console.error(err);
            alert('Ошибка при обработке файла');
        }
    };
    reader.readAsArrayBuffer(file);
}
// === 21. Обновление аналитики
function updateAnalytics() {
    const regularTransactions = transactions.filter(t => !t.isDollarSavings);
    const income = regularTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = regularTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const savings = income - expense;
    if (document.getElementById('analytics-income')) {
        document.getElementById('analytics-income').textContent = formatNumber(income) + ' ₽';
    }
    if (document.getElementById('analytics-expense')) {
        document.getElementById('analytics-expense').textContent = formatNumber(expense) + ' ₽';
    }
    if (document.getElementById('analytics-savings')) {
        document.getElementById('analytics-savings').textContent = formatNumber(savings) + ' ₽';
    }
    const expensesByCategory = {};
    regularTransactions.filter(t => t.type === 'expense').forEach(t => {
        expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
    });
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
    updateMonthlyPlan();
}
// === 22. Ежемесячный план
function updateMonthlyPlan() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (document.getElementById('current-month')) {
        document.getElementById('current-month').textContent = formatMonth(currentMonth);
    }
    const plan = financialPlans.find(p => p.month === currentMonth);
    const regularTransactions = transactions.filter(t => !t.isDollarSavings);
    const actualIncome = regularTransactions.filter(t => t.type === 'income' && t.date.startsWith(currentMonth)).reduce((sum, t) => sum + t.amount, 0);
    const actualExpense = regularTransactions.filter(t => t.type === 'expense' && t.date.startsWith(currentMonth)).reduce((sum, t) => sum + t.amount, 0);
    const plannedIncome = plan ? plan.income : 0;
    const plannedExpense = plan ? plan.expense : 0;
    if (document.getElementById('plan-income-value')) {
        document.getElementById('plan-income-value').textContent = `${formatNumber(plannedIncome)} ₽`;
    }
    if (document.getElementById('fact-income-value')) {
        document.getElementById('fact-income-value').textContent = `${formatNumber(actualIncome)} ₽`;
    }
    if (document.getElementById('progress-income-bar')) {
        document.getElementById('progress-income-bar').style.width = plannedIncome > 0 ? Math.min(100, (actualIncome / plannedIncome) * 100) + '%' : '0%';
    }
    if (document.getElementById('plan-expense-value')) {
        document.getElementById('plan-expense-value').textContent = `${formatNumber(plannedExpense)} ₽`;
    }
    if (document.getElementById('fact-expense-value')) {
        document.getElementById('fact-expense-value').textContent = `${formatNumber(actualExpense)} ₽`;
    }
    if (document.getElementById('progress-expense-bar')) {
        document.getElementById('progress-expense-bar').style.width = plannedExpense > 0 ? Math.min(100, (actualExpense / plannedExpense) * 100) + '%' : '0%';
    }
    const monthlySavings = actualIncome - actualExpense;
    if (document.getElementById('monthly-savings')) {
        document.getElementById('monthly-savings').textContent = formatShort(monthlySavings);
    }
}
// === 23. Формат месяца
function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}
// === 24. BI-графики
function initBI() {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    if (document.getElementById('bi-start-date')) {
        document.getElementById('bi-start-date').valueAsDate = startDate;
    }
    if (document.getElementById('bi-end-date')) {
        document.getElementById('bi-end-date').valueAsDate = today;
    }
    updateBI();
}
function updateBI() {
    const start = document.getElementById('bi-start-date')?.value;
    const end = document.getElementById('bi-end-date')?.value;
    if (!start || !end) return;
    if (new Date(start) > new Date(end)) {
        alert('Дата начала не может быть больше даты окончания');
        return;
    }
    const regularTransactions = transactions.filter(t => !t.isDollarSavings);
    const filtered = regularTransactions.filter(t => t.date >= start && t.date <= end);
    const balanceAtStart = regularTransactions.filter(t => t.date < start).reduce((sum, t) => t.type === 'income' ? sum + t.amount : sum - t.amount, 0);
    const weeklyData = getWeeklySavingsWithStartBalance(filtered, start, end, balanceAtStart);
    updateExpensePieChart(filtered);
    updateSavingsWeeklyChart(weeklyData);
}
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
// === 25. Обновление графиков (Ленивая загрузка)
function updateExpensePieChart(transactions) {
    const ctx = document.getElementById('expensePieChart');
    if (!ctx) return;
    
    // Проверяем, виден ли canvas (для ленивой загрузки)
    const rect = ctx.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom >= 0;
    if (!isVisible) return; // Не рендерим, если не видно

    const expensesByCategory = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
        expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
    });
    const categories = Object.keys(expensesByCategory);
    const values = Object.values(expensesByCategory);
    if (expensePieChart) {
        expensePieChart.data.labels = categories;
        expensePieChart.data.datasets[0].data = values;
        expensePieChart.update('none');
    } else {
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
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}
function updateSavingsWeeklyChart(weeklyData) {
    const ctx = document.getElementById('savingsWeeklyChart');
    if (!ctx) return;

    // Проверяем, виден ли canvas (для ленивой загрузки)
    const rect = ctx.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom >= 0;
    if (!isVisible) return; // Не рендерим, если не видно

    const weekLabels = weeklyData.map(w => w.week === '0' ? 'Начало' : w.week.toString());
    const weekSavings = weeklyData.map(w => w.savings);
    if (savingsWeeklyChart) {
        savingsWeeklyChart.data.labels = weekLabels;
        savingsWeeklyChart.data.datasets[0].data = weekSavings;
        savingsWeeklyChart.update('none');
    } else {
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
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false
                    }
                }
            }
        });
    }
}
// === 26. Авторизация
document.getElementById('login-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            document.getElementById('auth-error').textContent = '';
        })
        .catch(err => {
            console.error('Ошибка авторизации:', err);
            document.getElementById('auth-error').textContent = err.message;
        });
});
// === 27. Прослушка аутентификации
auth.onAuthStateChanged(user => {
    if (user) {
        console.log('Пользователь авторизован:', user.email);
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        loadFromFirebase();
        loadGoalFromFirebase();
    } else {
        console.log('Пользователь не авторизован');
        document.getElementById('app').style.display = 'none';
        document.getElementById('auth-screen').style.display = 'block';
    }
});
// === 28. Выход
function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        auth.signOut().catch(err => {
            console.error('Ошибка выхода:', err);
            alert('Не удалось выйти из системы');
        });
    }
}
// === 29. Тема
function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-theme');
    localStorage.setItem('dark-theme', isDark);
}
// === 30. Инициализация темы и фильтров
document.addEventListener('DOMContentLoaded', () => {
    const isDark = localStorage.getItem('dark-theme') === 'true';
    if (isDark) {
        document.body.classList.add('dark-theme');
    }
    
    // --- Инициализация нового компонента выбора диапазона дат ---
    const dateRangeInput = document.getElementById('filter-date-range');
    const filterStartInput = document.getElementById('filter-start');
    const filterEndInput = document.getElementById('filter-end');

    // Инициализация значений из localStorage или по умолчанию
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startDateStr = localStorage.getItem('filter-start') || startOfMonth.toISOString().split('T')[0];
    const endDateStr = localStorage.getItem('filter-end') || today.toISOString().split('T')[0];

    filterStartInput.value = startDateStr;
    filterEndInput.value = endDateStr;
    if (dateRangeInput) {
        dateRangeInput.value = `${startDateStr} - ${endDateStr}`;
    }

    if (dateRangeInput) {
        dateRangeInput.addEventListener('click', () => {
            const startDate = prompt("Введите дату начала (ГГГГ-ММ-ДД):", filterStartInput.value);
            if (startDate && !isNaN(Date.parse(startDate))) {
                const endDate = prompt("Введите дату окончания (ГГГГ-ММ-ДД):", filterEndInput.value);
                if (endDate && !isNaN(Date.parse(endDate))) {
                    if (new Date(startDate) > new Date(endDate)) {
                        alert('Дата начала не может быть больше даты окончания');
                        return;
                    }
                    filterStartInput.value = startDate;
                    filterEndInput.value = endDate;
                    dateRangeInput.value = `${startDate} - ${endDate}`;
                    localStorage.setItem('filter-start', startDate);
                    localStorage.setItem('filter-end', endDate);

                    // --- Автоматическое обновление списка ---
                    if (typeof renderAllListDebounced === 'function') {
                         renderAllListDebounced();
                    }
                    // -------------------------------
                } else if (endDate !== null) {
                     alert('Неверный формат даты окончания.');
                }
            } else if (startDate !== null) {
                 alert('Неверный формат даты начала.');
            }
        });
    }
    // --- Конец инициализации нового компонента выбора диапазона дат ---
});
// === 31. Навигация
function show(sectionId) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    const section = document.getElementById(sectionId);
    if (section) section.style.display = 'block';
    document.querySelectorAll('.bottom-nav button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.bottom-nav button[onclick="show('${sectionId}')"]`);
    if (activeBtn) activeBtn.classList.add('active');
    if (sectionId === 'list') {
        renderAllListDebounced();
    } else if (sectionId === 'add') {
        renderRecentList();
    } else if (sectionId === 'analytics') {
        updateAnalytics();
        if (!expensePieChart || !savingsWeeklyChart) {
            initBI();
        }
        // --- Ленивая загрузка графиков при переходе на вкладку ---
        // Добавим небольшую задержку, чтобы DOM успел отрендериться
        setTimeout(() => {
             updateBI(); // updateBI вызовет updateExpensePieChart и updateSavingsWeeklyChart
        }, 100);
        // --- Конец ленивой загрузки графиков ---
    } else if (sectionId === 'home') {
        // updateDollarSavings(); // Оптимизация: вызов через updateUIDebounced
        // updateHome(); // Оптимизация: вызов через updateUIDebounced
        updateUIDebounced(); // Вызовет все необходимые обновления с debounce
    }
}
// === 32. Pull-to-refresh
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
        if (refreshIndicator) {
            refreshIndicator.style.opacity = Math.min(1, diff / 100);
        }
    }
}, { passive: false });
document.body.addEventListener('touchend', () => {
    if (!isPulling) return;
    isPulling = false;
    if (currentY - startY > 80) {
        if (refreshIndicator) {
            refreshIndicator.style.opacity = 1;
        }
        loadFromFirebase();
        loadGoalFromFirebase();
        setTimeout(() => {
            if (refreshIndicator) {
                refreshIndicator.style.opacity = 0;
            }
        }, 1500);
    } else if (refreshIndicator) {
        refreshIndicator.style.opacity = 0;
    }
});
// === 33. История операций
function renderAllList() {
    const list = document.getElementById('all-transactions');
    if (!list) return;
    if (!transactions || !Array.isArray(transactions)) {
        list.innerHTML = '<li style="color: #999;">Загрузка данных...</li>';
        return;
    }
    list.innerHTML = '';
    // --- Получаем значения из скрытых полей, установленных компонентом ---
    const start = document.getElementById('filter-start')?.value;
    const end = document.getElementById('filter-end')?.value;
    // --- Сохранение в localStorage теперь происходит в компоненте ---

    let filtered = transactions;
    if (start) filtered = filtered.filter(t => t.date >= start);
    if (end) filtered = filtered.filter(t => t.date <= end);

    if (filtered.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Нет операций за выбранный период';
        li.style.color = '#999';
        list.appendChild(li);
        return;
    }
    const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(tx => {
        list.appendChild(createTransactionListItem(tx));
    });
}
// Добавляем дебаунсер
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}
// Создаем дебаунсированную версию
const renderAllListDebounced = debounce(renderAllList, 300);
// Создаем объединённую функцию обновления UI
function updateUI() {
    renderRecentList();
    updateHome();
    updateDollarSavings();
    updateDropdowns();
    if (isSectionActive('analytics')) updateAnalytics();
    if (isSectionActive('list')) renderAllListDebounced();
}
// Дебаунсированная версию
const updateUIDebounced = debounce(updateUI, 100);
// === 34. Экспорт
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
        "Автор": tx.author,
        "Комментарий": tx.comment || '',
        "Долларовые накопления": tx.isDollarSavings ? 'Да' : 'Нет'
    }));
    try {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Операции");
        const period = start && end ? `${start}_до_${end}` : "все";
        XLSX.writeFile(wb, `финансы_экспорт_${period}.xlsx`);
    } catch (err) {
        console.error('Ошибка экспорта:', err);
        alert('Ошибка при экспорте данных');
    }
}
// === 35. Функция для отображения/скрытия индикатора загрузки
function showLoadingIndicator(show) {
    const indicator = document.getElementById('refresh-indicator');
    if (indicator) {
        indicator.style.opacity = show ? '1' : '0';
    }
}
// === 36. Вспомогательная функция: Проверяет, активна ли секция
function isSectionActive(sectionId) {
    const section = document.getElementById(sectionId);
    return section && section.style.display !== 'none';
}
