import { plansCollection, db } from './firebase.js';
import { financialPlans, editingPlanId } from './state.js';
import { SecurityHelper, AppConfig } from '../config.js';
import { showSuccess, showError, renderPlanList } from './ui.js';
import { formatNumber, formatMonth } from './utils.js';

// Рендер списка планов
export function renderPlanList() {
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

// Начало редактирования плана
export function startEditPlan(id) {
    const plan = financialPlans.find(p => p.id === id);
    if (!plan) return;
    editingPlanId = id;
    document.getElementById('plan-month').value = plan.month;
    document.getElementById('plan-income').value = plan.income;
    document.getElementById('plan-expense').value = plan.expense;
}

// Удаление плана
export function deletePlan(id) {
    if (confirm('Удалить план?')) {
        plansCollection.doc(id).delete()
            .then(() => showSuccess('План удален'))
            .catch(err => {
                console.error('Ошибка удаления плана:', err);
                showError('Не удалось удалить план');
            });
    }
}

// Импорт планов из Excel
export function importPlanFromExcel() {
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

// Обработка формы плана
export function handlePlanFormSubmit(e) {
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
}

// Экспорт в Excel
export function exportToExcel() {
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
// Импорт необходимых переменных
import { transactions } from './state.js';
