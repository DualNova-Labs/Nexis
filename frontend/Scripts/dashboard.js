const userDetails = JSON.parse(localStorage.getItem('userDetails')) || JSON.parse(sessionStorage.getItem('userDetails'));
if (!userDetails) {
    window.location.href = '/login.html';
} else if (userDetails.role === 'admin') {
    window.location.href = './admin-dashboard.html';
}

// Display user email
document.getElementById('userEmail').textContent = userDetails.email;

// Session validation: Only allow one active login
async function validateSession() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    try {
const API_BASE = `http://${window.location.hostname}:3001`;        const res = await fetch(`${API_BASE}/user/admin/users`, { // Using any protected route to verify token
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (res.status === 401 && data.code === "SESSION_INVALIDATED") {
            alert(data.msg);
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = './login.html';
        }
    } catch (err) {
        console.error('Session validation error:', err);
    }
}

validateSession();

// Handle logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    try {
        await fetch(`${API_BASE}/user/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
    } catch (err) {
        console.error('Logout failed:', err);
    } finally {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = './login.html';
    }
});