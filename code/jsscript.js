document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("expense-form");
  const tableBody = document.querySelector("#expense-table tbody");
  const totalSpan = document.getElementById("total");
  const categoryList = document.getElementById("category-totals");

  let expenses = JSON.parse(localStorage.getItem("expenses")) || [];
  let editIndex = null;

  function updateTable() {
    tableBody.innerHTML = "";
    let total = 0;

    const categoryTotals = {
      Food: 0,
      Transport: 0,
      Rent: 0,
      Entertainment: 0,
      Other: 0
    };

    expenses.forEach((expense, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${expense.date}</td>
        <td>${expense.category}</td>
        <td>₹${parseFloat(expense.amount).toFixed(2)}</td>
        <td>${expense.note || ""}</td>
        <td class="action-buttons">
          <button class="edit-btn" data-index="${index}">Edit</button>
          <button class="delete-btn" data-index="${index}">Delete</button>
        </td>
      `;
      tableBody.appendChild(row);

      const amount = parseFloat(expense.amount);
      total += amount;

      if (categoryTotals.hasOwnProperty(expense.category)) {
        categoryTotals[expense.category] += amount;
      }
    });

    totalSpan.textContent = total.toFixed(2);

    categoryList.innerHTML = "";
    for (const [category, amount] of Object.entries(categoryTotals)) {
      const li = document.createElement("li");
      li.textContent = `${category}: ₹${amount.toFixed(2)}`;
      categoryList.appendChild(li);
    }

    // Attach event listeners for buttons
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", function () {
        const index = parseInt(this.getAttribute("data-index"));
        expenses.splice(index, 1);
        localStorage.setItem("expenses", JSON.stringify(expenses));
        updateTable();
      });
    });

    document.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", function () {
        const index = parseInt(this.getAttribute("data-index"));
        const exp = expenses[index];

        document.getElementById("date").value = exp.date;
        document.getElementById("category").value = exp.category;
        document.getElementById("amount").value = exp.amount;
        document.getElementById("note").value = exp.note;

        editIndex = index;
      });
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const date = document.getElementById("date").value;
    const category = document.getElementById("category").value;
    const amount = document.getElementById("amount").value;
    const note = document.getElementById("note").value;

    const newExpense = { date, category, amount, note };

    if (editIndex !== null) {
      expenses[editIndex] = newExpense;
      editIndex = null;
    } else {
      expenses.push(newExpense);
    }

    localStorage.setItem("expenses", JSON.stringify(expenses));
    form.reset();
    updateTable();
  });

  updateTable();
});
