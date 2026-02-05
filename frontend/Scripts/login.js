const url = `http://${window.location.hostname}:3001`;

// login script is  start hare
let login = document.getElementById("login-form");

login.addEventListener("submit", (e) => {
  e.preventDefault();

  let lemail = document.getElementById("lemail").value;
  let lpass = document.getElementById("lpass").value;
  let signdata = {
    email: lemail,
    password: lpass,
  };


  fetch(`${url}/user/login`, {
    method: "POST",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify(signdata),
  })
    .then((res) => res.json())

    .then((res) => {

      document.getElementById("lemail").value = "";
      document.getElementById("lpass").value = "";
      if (res.ok) {
        alert("Login Successful");
        localStorage.setItem("userDetails", JSON.stringify(res.user_details));
        localStorage.setItem("token", res.token);

        // Check if there's a pending room join
        const pendingRoomJoin = localStorage.getItem('pendingRoomJoin');
        if (pendingRoomJoin) {
          localStorage.removeItem('pendingRoomJoin');
          window.location.href = `./video.html?action=join&room=${pendingRoomJoin}`;
        } else if (res.user_details.role === 'admin') {
          window.location.href = "./admin-dashboard.html";
        } else {
          window.location.href = "./dashboard.html";
        }
      } else {
        alert(`${res.msg}`);
      }
    })
    .catch((err) => {
      console.log(err);
      alert("Something went wrong")
    });
});
