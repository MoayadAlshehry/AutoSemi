# Smart Semicolon for VS Code

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)

An intelligent Visual Studio Code extension that **automatically inserts semicolons** at the end of lines where they are needed. It saves time, reduces keystrokes, and helps prevent syntax errors.

---

## ✨ Features

- **Automatic Semicolon Insertion**  
  Adds a semicolon when you press `Enter` on a line that requires one.

- **Intelligent and Context-Aware**  
  Analyzes code to determine whether a semicolon is syntactically correct.

- **Avoids Common Pitfalls**  
  Skips semicolons where they would be invalid, such as:
  - Control structures (`if`, `for`, `while`, `switch`, etc.)
  - Function, class, or interface declarations
  - Lines ending in `{`, `(`, `[`
  - Empty lines or comments

- **Multi-Language Support**  
  Works with **Java**, **JavaScript**, and **TypeScript**.

- **Seamless Experience**  
  Runs silently in the background with **no configuration required**.

---

## ⚙️ How It Works

The extension listens for text changes in supported file types.  
When a newline is inserted, it analyzes the **preceding line of code**.

It will **NOT** insert a semicolon if the line:

- Already ends with `;`
- Is empty or contains only whitespace
- Is a single-line (`//`) or multi-line (`/* ... */`) comment
- Ends with `{`, `(`, `[`
- Is a control structure like `if (...)`, `for (...)`, `while (...)`
- Is a `class`, `interface`, `enum`, or `function` declaration
- Ends with a comma `,`, an arrow `=>`, or an operator (`+`, `&&`, etc.) indicating continuation

✅ If none of these conditions apply, a semicolon is automatically inserted.

---

## 📚 Supported Languages

- Java  
- JavaScript  
- TypeScript  

---

## 🔧 Installation

1. Open **Visual Studio Code**.
2. Go to the **Extensions** view (`Ctrl+Shift+X`).
3. Search for **Smart Semicolon**.
4. Click **Install**.
5. Reload VS Code if prompted.

---

## ⚡ Configuration

No configuration needed — works **out of the box**.

---

## 🤝 Contributing

Found a bug or have a suggestion? Contributions are welcome!  

- Open an issue on the GitHub repository.
- When reporting, please include:
  - The language you were using
  - A minimal code snippet showing the issue
  - The expected vs. actual behavior

---

## 📄 License

Licensed under the [MIT License](LICENSE.md).
