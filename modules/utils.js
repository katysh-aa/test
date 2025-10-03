import { AppConfig } from '../config.js';
import { cachedUsdRate, cachedUsdRateTime, usdRatePromise } from './state.js';

// Централизованное получение курса доллара с улучшенным кэшированием
export function getUsdRateCached() {
    if (!usdRatePromise) {
        usdRatePromise = getUsdRate().finally(() => {
            usdRatePromise = null;
        });
    }
    return usdRatePromise;
}

export async function getUsdRate() {
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

// Форматирование чисел
export function formatNumber(num) {
    if (isNaN(num) || num === null) return "0";
    return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatShort(num) {
    if (isNaN(num) || num === null) return "0";
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + " тыс. р.";
}

// Форматирование месяца
export function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

// Debounce утилита
export function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// Константы debounce для использования в других модулях
export const DEBOUNCE_DELAYS = AppConfig.DEBOUNCE_DELAYS;
