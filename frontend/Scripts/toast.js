/**
 * Toast Notification Utility
 * Provides Google-style snackbar notifications
 */

class Toast {
    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    show(message, type = 'info', duration = 4000) {
        const icons = {
            success: 'check_circle',
            error: 'error_outline',
            info: 'info'
        };
        const icon = icons[type] || 'info';

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">${icon}</span>
                <span>${message}</span>
            </div>
            <div class="toast-close">&times;</div>
        `;


        this.container.appendChild(toast);

        // Trigger reflow for animation
        toast.offsetHeight;
        toast.classList.add('show');

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.onclick = () => this.hide(toast);

        if (duration > 0) {
            setTimeout(() => {
                this.hide(toast);
            }, duration);
        }
    }

    hide(toast) {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode === this.container) {
                this.container.removeChild(toast);
            }
        }, 300);
    }

    success(message, duration) {
        this.show(message, 'success', duration);
    }

    error(message, duration) {
        this.show(message, 'error', duration);
    }

    info(message, duration) {
        this.show(message, 'info', duration);
    }
}

// Initialize global toast instance
window.toast = new Toast();
