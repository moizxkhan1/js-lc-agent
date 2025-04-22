import * as dotenv from "dotenv";
import express from "express";
import ragService from "./src/services/ragService.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

app.post("/api/chat", async (req, res) => {
  try {
    const { question, mode } = req.body;
    const result = await ragService.query(question, mode || "agent");
    res.json(result);
  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// app.post("/api/cgpa", (req, res) => {
//   try {
//     const { grades } = req.body;
//     const total = grades.reduce(
//       (acc, grade) => acc + grade.points * grade.credits,
//       0
//     );
//     const totalCredits = grades.reduce((acc, grade) => acc + grade.credits, 0);
//     const cgpa = total / totalCredits;
//     res.json({ cgpa: cgpa.toFixed(2) });
//   } catch (error) {
//     res.status(400).json({ error: "Invalid grade data provided" });
//   }
// });

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
