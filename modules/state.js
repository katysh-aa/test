// modules/state.js
// Глобальные переменные состояния приложения

export let transactions = [];
export let savingsGoal = 500000;
export let financialPlans = [];
export let editingPlanId = null;

// Глобальные переменные для графиков
export let expensePieChart = null;
export let savingsWeeklyChart = null;

// Переменные для кэширования курса доллара
export let cachedUsdRate = null;
export let cachedUsdRateTime = null;
export let usdRatePromise = null;
