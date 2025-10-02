// === 1. Firebase Initialization using Config ===
let db, auth, transactionsCollection, plansCollection, goalDocRef;

try {
    const firebaseServices = initializeFirebase();
    db = firebaseServices.db;
    auth = firebaseServices.auth;
    transactionsCollection = firebaseServices.transactionsCollection;
    plansCollection = firebaseServices.plansCollection;
    goalDocRef = firebaseServices.goalDocRef;
    console.log('✅ Firebase services initialized successfully');
} catch (error) {
    console.error('❌ Failed to initialize Firebase:', error);
    alert('Ошибка инициализации приложения. Пожалуйста, обновите страницу.');
}

// === 2. Глобальные переменные ===
let transactions = [];
let savingsGoal = 500000;
let financialPlans = [];
let editingPlanId = null;

// Глобальные переменные для графиков
let expensePieChart = null;
let savingsWeeklyChart = null;

// === 3. Централизованное получение курса доллара с улучшенным кэшированием ===
let cachedUsdRate = null;
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
    // Используем настройки из конфига
    const CACHE_DURATION = AppConfig.USD_CACHE_DURATION;
    
    // Проверяем localStorage как fallback
    const storedRate = localStorage.getItem('usdRateCache');
    if (storedRate) {
        const { rate, timestamp } = JSON.parse(storedRate);
        if (Date.now() - timestamp < CACHE_DURATION) {
            cachedUsdRate = rate;
            cachedUsdRateTime = timestamp;
            return rate;
        }
    }

    if (cachedUsdRate && (Date.now() - cachedUsdRateTime) < CACHE_DURATION) {
        return cachedUsdRate;
    }
    
    try {
        const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const rate = data.Valute.USD.Value;
        
        // Сохраняем в памяти и localStorage
        cachedUsdRate = rate;
        cachedUsdRateTime = Date.now();
        localStorage.setItem('usdRateCache', JSON.stringify({ rate, timestamp: cachedUsdRateTime }));
        
        return rate;
    } catch (error) {
        console.error('Ошибка получения курса доллара:', error);
        
        // Пробуем получить из localStorage как последнее средство
        if (storedRate) {
            const { rate } = JSON.parse(storedRate);
            console.warn('Используем устаревший курс из кэша');
            return rate;
        }
        
        if (cachedUsdRate) return cachedUsdRate;
        throw error;
    }
}

// === 4. Форматирование чисел ===
function formatNumber(num) {
    if (isNaN(num) || num === null) return "0";
    return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatShort(num) {
    if (isNaN(num) || num === null) return "0";
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + " тыс. р.";
}

// === 5. БЕЗОПАСНАЯ функция для создания элемента списка транзакции ===
function createTransactionListItem(tx) {
    const li = document.createElement('li');
    
    // Создаем структуру безопасно через DOM методы
    const container = document.createElement('div');
    
    // Основная информация
    const mainInfo = document.createElement('div');
    
    const categoryEl = document.createElement('strong');
    categoryEl.textContent = SecurityHelper.sanitizeInput(tx.category);
    
    const amountSpan = document.createElement('span');
    const amountColor = tx.type === 'income' ? '#34c759' : '#ff3b30';
    const sign = tx.type === 'income' ? '+' : '-';
    const currencySymbol = tx.isDollarSavings ? '$' : '₽';
    amountSpan.textContent = `${sign}${formatNumber(tx.amount)} ${currencySymbol}`;
    amountSpan.style.cssText = `color: ${amountColor}; font-weight: bold; margin-left: 8px;`;
    
    mainInfo.appendChild(categoryEl);
    mainInfo.appendChild(amountSpan);
    
    // Дополнительная информация
    const infoDiv = document.createElement('div');
    infoDiv.className = 'info';
    infoDiv.textContent = `${tx.date} · ${SecurityHelper.sanitizeInput(tx.author)}`;
    
    container.appendChild(mainInfo);
    container.appendChild(infoDiv);
    
    // Комментарий (если есть)
    if (tx.comment && tx.comment.trim()) {
        const commentDiv = document.createElement('div');
        commentDiv.className = 'info';
        commentDiv.textContent = `💬 ${SecurityHelper.sanitizeInput(tx.comment)}`;
        container.appendChild(commentDiv);
    }
    
    // Действия
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'actions';
    
    const editButton = document.createElement('button');
    editButton.className = 'btn small';
    editButton.onclick = () => startEdit(tx.id);
    
    const editIcon = document.createElement('img');
    editIcon.src = 'icons/edit.png';
    editIcon.alt = 'Редактировать';
    editIcon.className = 'action-icon';
    editButton.appendChild(editIcon);
    
    const deleteButton = document.createElement('button');
    deleteButton.className = 'btn small danger';
    deleteButton.onclick = () => deleteTransaction(tx.id);
    
    const deleteIcon = document.createElement('img');
    deleteIcon.src = 'icons/delete.png';
    deleteIcon.alt = 'Удалить';
    deleteIcon.className = 'action-icon';
    deleteButton.appendChild(deleteIcon);
    
    actionsDiv.appendChild(editButton);
    actionsDiv.appendChild(deleteButton);
    
    li.appendChild(container);
    li.appendChild(actionsDiv);
    
    return li;
}

// === 6. Загрузка цели ===
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
        showError("Не удалось загрузить цель. Проверьте подключение к интернету.");
    });
}

// === 7. Сохранение цели ===
function saveGoal() {
    const input = document.getElementById('savings-goal');
    const value = parseFloat(input.value);
    
    if (isNaN(value) || value < 0) {
        showError('Введите корректную сумму');
        return;
    }
    
    goalDocRef.set({ amount: value })
        .then(() => {
            savingsGoal = value;
            localStorage.setItem('savingsGoal', savingsGoal);
            updateHome();
            showSuccess(`🎯 Цель обновлена: ${formatNumber(savingsGoal)} ₽`);
        })
        .catch(err => {
            console.error("Ошибка сохранения цели:", err);
            showError("Не удалось сохранить цель.");
        });
}

// === 8. Загрузка данных ===
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
            updateDollarSavings();
        }
    }, error => {
        console.error("Ошибка загрузки транзакций:", error);
        showError("Ошибка загрузки данных. Проверьте подключение к интернету.");
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
        showError("Ошибка загрузки финансовых планов.");
    });
}

// === 9. Обновление выпадающих списков ===
function updateDropdowns() {
    const regularTransactions = transactions.filter(t => !t.isDollarSavings);
    const categories = [...new Set(regularTransactions.map(t => SecurityHelper.sanitizeInput(t.category)))].sort();
    const authors = [...new Set(regularTransactions.map(t => SecurityHelper.sanitizeInput(t.author)))].sort();

    const updateSelect = (selectId, values) => {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '';
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
    };

    updateSelect('categories', categories);
    updateSelect('edit-categories', categories);
    updateSelect('authors', authors);
    updateSelect('edit-authors', authors);
}

// === 10. Обновление главной ===
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
        .then(usdRate => {
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

// === 11. Обновление блока "Долларовые накопления" ===
function updateDollarSavings() {
    getUsdRateCached()
        .then(usdRate => {
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
                document.getElementById('dollar-rate').textContent = `Курс: ${usdRate.toFixed(2)} ₽/$`;
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

// === 12. Последние 10 операций ===
function renderRecentList() {
    const list = document.getElementById('recent-transactions');
    if (!list) return;
    if (!transactions || !Array.isArray(transactions)) {
        list.innerHTML = '';
        const li = document.createElement('li');
        li.textContent = 'Загрузка...';
        li.style.color = '#999';
        list.appendChild(li);
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

// === 13. БЕЗОПАСНОЕ добавление операции ===
document.getElementById('add-form')?.addEventListener('submit', e => {
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
    
    transactionsCollection.add(newTx)
        .then(() => {
            form.reset();
            document.getElementById('date').valueAsDate = new Date();
            renderRecentList();
            if (isSectionActive('list')) {
                renderAllListDebounced();
            }
            if (newTx.isDollarSavings) {
                updateDollarSavings();
                updateHome();
            }
            showSuccess('Операция успешно добавлена');
        })
        .catch(err => {
            console.error('Ошибка добавления операции:', err);
            showError('Ошибка при добавлении операции: ' + err.message);
        });
});

// === 14. БЕЗОПАСНОЕ редактирование операции ===
function startEdit(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    
    document.getElementById('edit-id').value = tx.id;
    document.getElementById('edit-date').value = tx.date;
    document.getElementById('edit-category').value = SecurityHelper.sanitizeInput(tx.category);
    document.getElementById('edit-amount').value = tx.amount;
    document.getElementById('edit-type').value = tx.type;
    document.getElementById('edit-author').value = SecurityHelper.sanitizeInput(tx.author);
    document.getElementById('edit-comment').value = SecurityHelper.sanitizeInput(tx.comment || '');
    
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
    
    transactionsCollection.doc(id).update(updatedTx)
        .then(() => {
            document.getElementById('edit-form').style.display = 'none';
            form.reset();
            renderRecentList();
            if (isSectionActive('list')) {
                renderAllListDebounced();
            }
            updateDollarSavings();
            updateHome();
            showSuccess('Операция успешно обновлена');
        })
        .catch(err => {
            console.error('Ошибка обновления операции:', err);
            showError('Ошибка при обновлении операции: ' + err.message);
        });
});

function cancelEdit() {
    document.getElementById('edit-form').style.display = 'none';
    document.getElementById('edit-form').reset();
}

// === 15. Удаление операции ===
function deleteTransaction(id) {
    if (confirm('Удалить операцию?')) {
        const txToDelete = transactions.find(t => t.id === id);
        transactionsCollection.doc(id).delete()
            .then(() => {
                renderRecentList();
                if (isSectionActive('list')) {
                    renderAllListDebounced();
                }
                if (txToDelete && txToDelete.isDollarSavings) {
                    updateDollarSavings();
                    updateHome();
                }
                showSuccess('Операция удалена');
            })
            .catch(err => {
                console.error('Ошибка удаления операции:', err);
                showError('Не удалось удалить операцию');
            });
    }
}

// === 16. Финансовый план ===
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
        
        const container = document.createElement('div');
        
        const title = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = formatMonth(plan.month);
        title.appendChild(strong);
        
        const info = document.createElement('div');
        info.className = 'info';
        info.textContent = `Доход: ${formatNumber(plan.income)} ₽ · Расход: ${formatNumber(plan.expense)} ₽`;
        
        container.appendChild(title);
        container.appendChild(info);
        
        const actions = document.createElement('div');
        actions.className = 'actions';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'btn small';
        editBtn.onclick = () => startEditPlan(plan.id);
        
        const editIcon = document.createElement('img');
        editIcon.src = 'icons/edit.png';
        editIcon.alt = 'Редактировать';
        editIcon.className = 'action-icon';
        editBtn.appendChild(editIcon);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn small danger';
        deleteBtn.onclick = () => deletePlan(plan.id);
        
        const deleteIcon = document.createElement('img');
        deleteIcon.src = 'icons/delete.png';
        deleteIcon.alt = 'Удалить';
        deleteIcon.className = 'action-icon';
        deleteBtn.appendChild(deleteIcon);
        
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        
        li.appendChild(container);
        li.appendChild(actions);
        list.appendChild(li);
    });
}

// === 17. Редактирование плана ===
function startEditPlan(id) {
    const plan = financialPlans.find(p => p.id === id);
    if (!plan) return;
    editingPlanId = id;
    document.getElementById('plan-month').value = plan.month;
    document.getElementById('plan-income').value = plan.income;
    document.getElementById('plan-expense').value = plan.expense;
}

// === 18. Ввод плана ===
document.getElementById('plan-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const month = document.getElementById('plan-month').value;
    const income = parseFloat(document.getElementById('plan-income').value);
    const expense = parseFloat(document.getElementById('plan-expense').value);
    
    if (isNaN(income) || isNaN(expense) || !month) {
        showError('Заполните все поля корректно');
        return;
    }
    
    const planData = { month, income, expense };
    const validation = SecurityHelper.validateFinancialPlan(planData);
    if (!validation.isValid) {
        showError('Ошибка валидации: ' + validation.errors.join(', '));
        return;
    }
    
    if (editingPlanId) {
        plansCollection.doc(editingPlanId).update({ month, income, expense })
            .then(() => {
                editingPlanId = null;
                document.getElementById('plan-form').reset();
                showSuccess('План успешно обновлен');
            })
            .catch(err => {
                console.error('Ошибка обновления плана:', err);
                showError('Не удалось обновить план');
            });
    } else {
        const exists = financialPlans.find(p => p.month === month);
        if (exists) {
            if (confirm(`План на ${formatMonth(month)} уже существует. Заменить?`)) {
                plansCollection.doc(exists.id).update({ income, expense })
                    .then(() => showSuccess('План успешно обновлен'))
                    .catch(err => {
                        console.error('Ошибка обновления плана:', err);
                        showError('Не удалось обновить план');
                    });
            }
        } else {
            plansCollection.add({ month, income, expense })
                .then(() => showSuccess('План успешно создан'))
                .catch(err => {
                    console.error('Ошибка создания плана:', err);
                    showError('Не удалось создать план');
                });
        }
        document.getElementById('plan-form').reset();
    }
});

// === 19. Удаление плана ===
function deletePlan(id) {
    if (confirm('Удалить план?')) {
        plansCollection.doc(id).delete()
            .then(() => showSuccess('План удален'))
            .catch(err => {
                console.error('Ошибка удаления плана:', err);
                showError('Не удалось удалить план');
            });
    }
}

// === 20. Импорт ===
function importPlanFromExcel() {
    const fileInput = document.getElementById('import-plan-file');
    const file = fileInput.files[0];
    
    if (!file) {
        showError('Выберите файл');
        return;
    }
    
    // Проверка размера файла
    if (file.size > AppConfig.MAX_FILE_SIZE) {
        showError(`Файл слишком большой. Максимальный размер: ${AppConfig.MAX_FILE_SIZE / 1024 / 1024}MB`);
        return;
    }
    
    const MAX_ROWS = AppConfig.MAX_EXCEL_ROWS;
    const reader = new FileReader();
    
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            const rows = json.slice(json[0]?.includes('Месяц') ? 1 : 0);
            
            if (rows.length > MAX_ROWS) {
                showError(`Файл содержит слишком много строк (максимум ${MAX_ROWS}).`);
                return;
            }
            
            const batch = db.batch();
            let validCount = 0;
            let errorCount = 0;
            
            for (const row of rows) {
                const [month, incomeRaw, expenseRaw] = row;
                if (!month || isNaN(incomeRaw) || isNaN(expenseRaw)) {
                    errorCount++;
                    continue;
                }
                
                let monthFormatted;
                if (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
                    monthFormatted = month;
                } else if (typeof month === 'number') {
                    const date = new Date((month - 25569) * 86400 * 1000);
                    monthFormatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                } else {
                    errorCount++;
                    continue;
                }
                
                const income = parseFloat(incomeRaw);
                const expense = parseFloat(expenseRaw);
                
                // Валидация данных плана
                const validation = SecurityHelper.validateFinancialPlan({ month: monthFormatted, income, expense });
                if (!validation.isValid) {
                    errorCount++;
                    continue;
                }
                
                const existing = financialPlans.find(p => p.month === monthFormatted);
                const docRef = existing ? plansCollection.doc(existing.id) : plansCollection.doc();
                batch.set(docRef, { month: monthFormatted, income, expense }, { merge: true });
                validCount++;
            }
            
            if (validCount === 0) {
                showError('Не удалось распознать данные в файле');
                return;
            }
            
            batch.commit().then(() => {
                const message = `✅ Успешно импортировано ${validCount} записей` + 
                               (errorCount > 0 ? `, пропущено ${errorCount} невалидных записей` : '');
                showSuccess(message);
                fileInput.value = '';
            }).catch(err => {
                console.error('Ошибка импорта:', err);
                showError('Ошибка при импорте данных');
            });
            
        } catch (err) {
            console.error(err);
            showError('Ошибка при обработке файла');
        }
    };
    
    reader.onerror = function() {
        showError('Ошибка при чтении файла');
    };
    
    reader.readAsArrayBuffer(file);
}

// === 21. Обновление аналитики ===
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
            const strong = document.createElement('strong');
            strong.textContent = SecurityHelper.sanitizeInput(cat) + ':';
            li.appendChild(strong);
            li.appendChild(document.createTextNode(` ${formatNumber(amt)} ₽`));
            topList.appendChild(li);
        });
    }

    updateMonthlyPlan();
}

// === 22. Ежемесячный план ===
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

// === 23. Формат месяца ===
function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

// === 24. BI-графики ===
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
        showError('Дата начала не может быть больше даты окончания');
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

// === 25. Обновление графиков ===
function updateExpensePieChart(transactions) {
    const ctx = document.getElementById('expensePieChart');
    if (!ctx) return;
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

// === 26. Авторизация ===
document.getElementById('login-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    // Базовая санатизация email
    const sanitizedEmail = SecurityHelper.sanitizeInput(email);
    
    auth.signInWithEmailAndPassword(sanitizedEmail, password)
        .then(() => {
            document.getElementById('auth-error').textContent = '';
        })
        .catch(err => {
            console.error('Ошибка авторизации:', err);
            let errorMessage = 'Ошибка авторизации';
            if (err.code === 'auth/invalid-email') errorMessage = 'Неверный формат email';
            else if (err.code === 'auth/user-not-found') errorMessage = 'Пользователь не найден';
            else if (err.code === 'auth/wrong-password') errorMessage = 'Неверный пароль';
            document.getElementById('auth-error').textContent = errorMessage;
        });
});

// === 27. Прослушка аутентификации ===
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

// === 28. Выход ===
function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        auth.signOut().catch(err => {
            console.error('Ошибка выхода:', err);
            showError('Не удалось выйти из системы');
        });
    }
}

// === 29. Тема ===
function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-theme');
    localStorage.setItem('dark-theme', isDark);
}

// === 30. Инициализация темы и фильтров ===
document.addEventListener('DOMContentLoaded', () => {
    const isDark = localStorage.getItem('dark-theme') === 'true';
    if (isDark) {
        document.body.classList.add('dark-theme');
    }
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (document.getElementById('filter-start')) {
        document.getElementById('filter-start').value = localStorage.getItem('filter-start') || startOfMonth.toISOString().split('T')[0];
    }
    if (document.getElementById('filter-end')) {
        document.getElementById('filter-end').value = localStorage.getItem('filter-end') || today.toISOString().split('T')[0];
    }
});

// === 31. Навигация ===
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
        if (!expensePieChart) {
            initBI();
        }
    } else if (sectionId === 'home') {
        updateDollarSavings();
        updateHome();
    }
}

// === 32. Pull-to-refresh ===
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

// === 33. История операций ===
function renderAllList() {
    const list = document.getElementById('all-transactions');
    if (!list) return;
    if (!transactions || !Array.isArray(transactions)) {
        list.innerHTML = '';
        const li = document.createElement('li');
        li.textContent = 'Загрузка данных...';
        li.style.color = '#999';
        list.appendChild(li);
        return;
    }
    list.innerHTML = '';
    const start = document.getElementById('filter-start')?.value;
    const end = document.getElementById('filter-end')?.value;
    if (start) localStorage.setItem('filter-start', start);
    if (end) localStorage.setItem('filter-end', end);
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

// === 34. Утилиты ===
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

const renderAllListDebounced = debounce(renderAllList, AppConfig.DEBOUNCE_DELAYS.RENDER_LIST);

function updateUI() {
    renderRecentList();
    updateHome();
    updateDollarSavings();
    updateDropdowns();
    if (isSectionActive('analytics')) updateAnalytics();
    if (isSectionActive('list')) renderAllListDebounced();
}

const updateUIDebounced = debounce(updateUI, AppConfig.DEBOUNCE_DELAYS.UI_UPDATE);

// === 35. Экспорт ===
function exportToExcel() {
    const start = document.getElementById('filter-start')?.value;
    const end = document.getElementById('filter-end')?.value;
    let filtered = [...transactions];
    if (start) filtered = filtered.filter(t => t.date >= start);
    if (end) filtered = filtered.filter(t => t.date <= end);
    if (filtered.length === 0) {
        showError('Нет данных для экспорта');
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
        showSuccess('Данные успешно экспортированы');
    } catch (err) {
        console.error('Ошибка экспорта:', err);
        showError('Ошибка при экспорте данных');
    }
}

// === 36. Улучшенные уведомления ===
function showError(message) {
    console.error('❌ Error:', message);
    // Временное решение - можно заменить на красивый toast
    alert(`❌ ${message}`);
}

function showSuccess(message) {
    console.log('✅ Success:', message);
    // Временное решение - можно заменить на красивый toast
    alert(`✅ ${message}`);
}

function showLoadingIndicator(show) {
    const indicator = document.getElementById('refresh-indicator');
    if (indicator) {
        indicator.style.opacity = show ? '1' : '0';
    }
}

function isSectionActive(sectionId) {
    const section = document.getElementById(sectionId);
    return section && section.style.display !== 'none';
}
