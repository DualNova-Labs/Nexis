const signupForm = document.getElementById("signup-form");
const messageDiv = document.getElementById("message");

function showMessage(message, isError = false) {
  messageDiv.textContent = message;
  messageDiv.style.color = isError ? "#ff4444" : "#00C896";
  messageDiv.style.display = "block";
  setTimeout(() => {
    messageDiv.style.display = "none";
  }, 5000);
}

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const firstName = document.getElementById("fname").value.trim();
  const lastName = document.getElementById("lname").value.trim();
  const name = `${firstName} ${lastName}`.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  // Client-side validation
  if (!name || !email || !password) {
    showMessage("Please fill in all fields", true);
    return;
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showMessage("Please enter a valid email address", true);
    return;
  }

  // Password validation
  if (password.length < 6) {
    showMessage("Password must be at least 6 characters long", true);
    return;
  }

  try {
    const response = await fetch(`http://${window.location.hostname}:3001/user/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.msg || "Signup failed");
    }

    if (data.ok) {
      showMessage("Registration successful! Redirecting...");

      localStorage.setItem("userDetails", JSON.stringify(data.user_details));
      localStorage.setItem("token", data.token);

      // Immediate redirection based on role
      if (data.user_details.role === 'admin') {
        window.location.href = "./admin-dashboard.html";
      } else {
        window.location.href = "./dashboard.html";
      }
    }

  } catch (error) {
    console.error("Signup error:", error);
    showMessage(error.message || "Registration failed. Please try again.", true);
  }
});