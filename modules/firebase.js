import { firebaseConfig, initializeFirebase } from '../config.js';

// Инициализируем Firebase и получаем сервисы
const firebaseServices = initializeFirebase();

// Экспортируем отдельные сервисы для удобства использования
export const db = firebaseServices.db;
export const auth = firebaseServices.auth;
export const transactionsCollection = firebaseServices.transactionsCollection;
export const plansCollection = firebaseServices.plansCollection;
export const goalDocRef = firebaseServices.goalDocRef;

// Экспортируем полный объект для обратной совместимости
export default firebaseServices;
