import { auth } from './firebase.js';
import { domElements } from './dom.js';
import { showError } from './ui.js';
import { loadFromFirebase, loadGoalFromFirebase } from './transactions.js';
import { SecurityHelper } from '../config.js';

// Инициализация аутентификации
export function initAuth() {
    // Прослушка состояния аутентификации
    auth.onAuthStateChanged(user => {
        if (user) {
            console.log('Пользователь авторизован:', user.email);
            domElements.authScreen.style.display = 'none';
            domElements.app.style.display = 'block';
            loadFromFirebase();
            loadGoalFromFirebase();
        } else {
            console.log('Пользователь не авторизован');
            domElements.app.style.display = 'none';
            domElements.authScreen.style.display = 'block';
        }
    });

    // Обработка формы входа
    if (domElements.loginForm) {
        domElements.loginForm.addEventListener('submit', handleLogin);
    }
}

// Обработка входа
function handleLogin(e) {
    e.preventDefault();
    const email = domElements.loginEmailInput.value;
    const password = domElements.loginPasswordInput.value;
    
    // Базовая санатизация email
    const sanitizedEmail = SecurityHelper.sanitizeInput(email);
    
    auth.signInWithEmailAndPassword(sanitizedEmail, password)
        .then(() => {
            if (domElements.authError) {
                domElements.authError.textContent = '';
            }
        })
        .catch(err => {
            console.error('Ошибка авторизации:', err);
            let errorMessage = 'Ошибка авторизации';
            if (err.code === 'auth/invalid-email') errorMessage = 'Неверный формат email';
            else if (err.code === 'auth/user-not-found') errorMessage = 'Пользователь не найден';
            else if (err.code === 'auth/wrong-password') errorMessage = 'Неверный пароль';
            
            if (domElements.authError) {
                domElements.authError.textContent = errorMessage;
            }
        });
}

// Выход из системы
export function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        auth.signOut().catch(err => {
            console.error('Ошибка выхода:', err);
            showError('Не удалось выйти из системы');
        });
    }
}

// Получение текущего пользователя
export function getCurrentUser() {
    return auth.currentUser;
}

// Проверка авторизации
export function isAuthenticated() {
    return !!auth.currentUser;
}
