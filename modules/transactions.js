import { transactionsCollection, goalDocRef } from './firebase.js';
import { transactions, savingsGoal } from './state.js';
import { SecurityHelper } from '../config.js';
import { showSuccess, showError, updateDropdowns, renderRecentList, renderAllListDebounced, updateUIDebounced } from './ui.js';
import { updateHome, updateDollarSavings } from './analytics.js';

// Загрузка данных из Firebase
export function loadFromFirebase() {
    showLoadingIndicator(true);
    let isFirstLoad = true;

    transactionsCollection.orderBy('date', 'desc').onSnapshot(snapshot => {
        transactions.length = 0; // Очищаем массив
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
}

// Загрузка цели из Firebase
export function loadGoalFromFirebase() {
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

// Сохранение цели
export function saveGoal() {
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

// Добавление транзакции
export function addTransaction(transactionData) {
    return transactionsCollection.add(transactionData)
        .then(() => {
            renderRecentList();
            if (isSectionActive('list')) {
                renderAllListDebounced();
            }
            if (transactionData.isDollarSavings) {
                updateDollarSavings();
                updateHome();
            }
            showSuccess('Операция успешно добавлена');
        })
        .catch(err => {
            console.error('Ошибка добавления операции:', err);
            showError('Ошибка при добавлении операции: ' + err.message);
        });
}

// Начало редактирования транзакции
export function startEdit(id) {
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

// Обновление транзакции
export function updateTransaction(id, updatedTx) {
    return transactionsCollection.doc(id).update(updatedTx)
        .then(() => {
            document.getElementById('edit-form').style.display = 'none';
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
}

// Удаление транзакции
export function deleteTransaction(id) {
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

// Отмена редактирования
export function cancelEdit() {
    document.getElementById('edit-form').style.display = 'none';
    document.getElementById('edit-form').reset();
}

// Импорты функций из других модулей
import { formatNumber } from './utils.js';
import { showLoadingIndicator, isSectionActive } from './ui.js';
