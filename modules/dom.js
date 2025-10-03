// Централизованное управление DOM элементами

export const domElements = {
    // Формы
    addForm: document.getElementById('add-form'),
    editForm: document.getElementById('edit-form'),
    planForm: document.getElementById('plan-form'),
    loginForm: document.getElementById('login-form'),
    
    // Поля ввода
    savingsGoalInput: document.getElementById('savings-goal'),
    dateInput: document.getElementById('date'),
    categoryInput: document.getElementById('category'),
    amountInput: document.getElementById('amount'),
    typeInput: document.getElementById('type'),
    authorInput: document.getElementById('author'),
    commentInput: document.getElementById('comment'),
    dollarSavingsInput: document.getElementById('dollar-savings'),
    
    // Поля редактирования
    editIdInput: document.getElementById('edit-id'),
    editDateInput: document.getElementById('edit-date'),
    editCategoryInput: document.getElementById('edit-category'),
    editAmountInput: document.getElementById('edit-amount'),
    editTypeInput: document.getElementById('edit-type'),
    editAuthorInput: document.getElementById('edit-author'),
    editCommentInput: document.getElementById('edit-comment'),
    editDollarSavingsInput: document.getElementById('edit-dollar-savings'),
    
    // Поля финансового плана
    planMonthInput: document.getElementById('plan-month'),
    planIncomeInput: document.getElementById('plan-income'),
    planExpenseInput: document.getElementById('plan-expense'),
    
    // Поля авторизации
    loginEmailInput: document.getElementById('login-email'),
    loginPasswordInput: document.getElementById('login-password'),
    authError: document.getElementById('auth-error'),
    
    // Поля фильтров
    filterStartInput: document.getElementById('filter-start'),
    filterEndInput: document.getElementById('filter-end'),
    
    // Поля BI аналитики
    biStartDateInput: document.getElementById('bi-start-date'),
    biEndDateInput: document.getElementById('bi-end-date'),
    
    // Списки
    recentTransactions: document.getElementById('recent-transactions'),
    allTransactions: document.getElementById('all-transactions'),
    planList: document.getElementById('plan-list'),
    topExpenses: document.getElementById('top-expenses'),
    
    // Выпадающие списки
    categoriesSelect: document.getElementById('categories'),
    editCategoriesSelect: document.getElementById('edit-categories'),
    authorsSelect: document.getElementById('authors'),
    editAuthorsSelect: document.getElementById('edit-authors'),
    
    // Элементы статистики
    totalSavings: document.getElementById('total-savings'),
    monthlyIncome: document.getElementById('monthly-income'),
    monthlyExpense: document.getElementById('monthly-expense'),
    rubleSavingsAmount: document.getElementById('ruble-savings-amount'),
    rubleProgressFill: document.getElementById('ruble-progress-fill'),
    rubleProgressText: document.getElementById('ruble-progress-text'),
    dollarSavingsAmount: document.getElementById('dollar-savings-amount'),
    dollarSavingsRub: document.getElementById('dollar-savings-rub'),
    dollarRate: document.getElementById('dollar-rate'),
    
    // Элементы аналитики
    analyticsIncome: document.getElementById('analytics-income'),
    analyticsExpense: document.getElementById('analytics-expense'),
    currentMonth: document.getElementById('current-month'),
    planIncomeValue: document.getElementById('plan-income-value'),
    factIncomeValue: document.getElementById('fact-income-value'),
    progressIncomeBar: document.getElementById('progress-income-bar'),
    planExpenseValue: document.getElementById('plan-expense-value'),
    factExpenseValue: document.getElementById('fact-expense-value'),
    progressExpenseBar: document.getElementById('progress-expense-bar'),
    monthlySavings: document.getElementById('monthly-savings'),
    
    // Графики
    expensePieChart: document.getElementById('expensePieChart'),
    savingsWeeklyChart: document.getElementById('savingsWeeklyChart'),
    
    // Индикаторы и уведомления
    refreshIndicator: document.getElementById('refresh-indicator'),
    offlineIndicator: document.getElementById('offline-indicator'),
    authScreen: document.getElementById('auth-screen'),
    app: document.getElementById('app'),
    
    // Импорт/экспорт
    importPlanFile: document.getElementById('import-plan-file')
};

// Вспомогательная функция для проверки существования элементов
export function validateDomElements() {
    const missingElements = [];
    
    for (const [key, element] of Object.entries(domElements)) {
        if (!element && !key.includes('Input') && !key.includes('Select')) {
            console.warn(`⚠️ DOM элемент не найден: ${key}`);
            missingElements.push(key);
        }
    }
    
    if (missingElements.length > 0) {
        console.warn(`⚠️ Всего не найдено элементов: ${missingElements.length}`);
    }
    
    return missingElements;
}

// Инициализация проверки DOM элементов при загрузке модуля
if (typeof window !== 'undefined') {
    setTimeout(() => {
        validateDomElements();
    }, 100);
}
