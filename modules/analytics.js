import { transactions, financialPlans, expensePieChart, savingsWeeklyChart } from './state.js';
import { getUsdRateCached, formatNumber, formatShort } from './utils.js';

// Обновление главной страницы
export function updateHome() {
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

// Обновление блока "Долларовые накопления"
export function updateDollarSavings() {
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

// Обновление аналитики
export function updateAnalytics() {
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

// Ежемесячный план
export function updateMonthlyPlan() {
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

// BI-графики
export function initBI() {
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

export function updateBI() {
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

// Обновление графиков
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

// Импорты функций из других модулей
import { SecurityHelper } from '../config.js';
import { savingsGoal } from './state.js';
import { formatMonth } from './utils.js';
import { showError } from './ui.js';
