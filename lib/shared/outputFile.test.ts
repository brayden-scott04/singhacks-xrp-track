import { describe, expect, it } from "vitest";
import { detectOutputFile } from "./outputFile";

describe("detectOutputFile", () => {
  it("returns null for a plain prose answer", () => {
    expect(detectOutputFile("why is the sky blue", "The sky is blue because of Rayleigh scattering.")).toBeNull();
  });

  it("returns null for prose that merely mentions code", () => {
    const output = "You could use a for loop here, but a simple sum() call is cleaner and just as fast.";
    expect(detectOutputFile("how do I sum a list", output)).toBeNull();
  });

  it("detects a single fenced code block and strips the fence", () => {
    const output = "```python\ndef square(n):\n    return n * n\n```";
    const result = detectOutputFile("write a python program to square a number", output);

    expect(result).not.toBeNull();
    expect(result?.filename).toMatch(/\.py$/);
    expect(result?.content).toBe("def square(n):\n    return n * n");
  });

  it("detects a fenced code block surrounded by explanatory prose", () => {
    const output =
      "Sure! Here's a Python file that calculates the square of a number:\n\n" +
      "```python\ndef square(n):\n    return n * n\n\nprint(square(5))\n```\n\n" +
      "Save this as square.py and run it with `python square.py`.";
    const result = detectOutputFile("write me a python file to download so i can calculate the square of a number", output);

    expect(result).not.toBeNull();
    expect(result?.filename).toMatch(/\.py$/);
    expect(result?.content).toBe("def square(n):\n    return n * n\n\nprint(square(5))");
    expect(result?.content).not.toContain("Sure!");
  });

  it("picks the real code fence over a usage-command fence and an untagged example-output fence", () => {
    const output =
      "Certainly! Below is a simple Python script that prompts the user to enter a number and prints its square.\n\n" +
      "```python\n# square_calculator.py\n\ndef calculate_square(number):\n    return number ** 2\n\n" +
      "def main():\n    user_input = input(\"Enter a number to calculate its square: \")\n    number = float(user_input)\n" +
      "    print(f\"The square of {number} is {calculate_square(number)}\")\n\nif __name__ == \"__main__\":\n    main()\n```\n\n" +
      "### How to Use:\n1. Save the script as `square_calculator.py`.\n2. Run it:\n\n" +
      "```bash\npython square_calculator.py\n```\n\n### Example Output:\n```\n" +
      "Enter a number to calculate its square: 5\nThe square of 5.0 is 25.0\n```\n\n" +
      "This script handles both integer and decimal inputs.";
    const result = detectOutputFile("write me a python file to download so i can calculate the square of a number", output);

    expect(result?.filename).toMatch(/\.py$/);
    expect(result?.content).toContain("def calculate_square");
    expect(result?.content).not.toContain("python square_calculator.py");
    expect(result?.content).not.toContain("Enter a number to calculate its square: 5");
  });

  it("falls back to .txt for an unrecognized fence language", () => {
    const output = "```brainfuck\n++++++++\n```";
    const result = detectOutputFile("write something obscure", output);

    expect(result?.filename).toMatch(/\.txt$/);
  });

  it("bundles only the fenced content (not surrounding prose) for multiple code blocks", () => {
    const output = "Here you go:\n```js\nconsole.log(1)\n```\nthen\n```js\nconsole.log(2)\n```\nEnjoy!";
    const result = detectOutputFile("two snippets", output);

    expect(result?.filename).toMatch(/\.md$/);
    expect(result?.content).toBe("console.log(1)\n\nconsole.log(2)");
  });

  it("ignores trivial inline-sized fences when deciding fence count", () => {
    const output = "Use `x` as shown:\n```\nx\n```\nThat's it.";
    const result = detectOutputFile("tiny example", output);

    expect(result).toBeNull();
  });

  it("detects standalone valid JSON with no fence", () => {
    const output = '{"name": "widget", "price": 9.99}';
    const result = detectOutputFile("generate a config", output);

    expect(result?.filename).toMatch(/\.json$/);
    expect(result?.content).toBe(output);
  });

  it("derives the filename slug from the prompt", () => {
    const result = detectOutputFile("Write a Python program to calculate the square of a number", "```python\nprint(1)\n```");
    expect(result?.filename).toBe("write-a-python-program-to-calculate.py");
  });

  it("falls back to a generic filename when the prompt has no usable words", () => {
    const result = detectOutputFile("???", "```python\nprint(1)\n```");
    expect(result?.filename).toBe("bidstream-output.py");
  });
});
