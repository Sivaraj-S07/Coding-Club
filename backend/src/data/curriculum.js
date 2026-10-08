/**
 * Built-in coding curriculum used by the AI learning features:
 *   - lessons (English + Tamil) that the Content Simplifier / AI Tutor build on
 *   - a leveled question bank (easy / medium / hard) for Adaptive Practice
 *   - a glossary used by the offline simplifier
 *
 * It is plain data on purpose: extending the platform with a new topic is just
 * adding another entry here (no migration needed). The correct answer of a
 * question is NEVER sent to the browser before the student answers — see
 * adaptiveEngine.publicQuestion().
 *
 * Question format: `options[0]` is always the correct option in this file;
 * the engine shuffles the options per serving and tracks the mapping server
 * side, so the stored order never leaks the answer.
 */

const LEVELS = ["easy", "medium", "hard"];

const TOPICS = [
  {
    id: "variables",
    order: 1,
    icon: "Box",
    prerequisites: [],
    title: { en: "Variables & Data Types", ta: "மாறிகள் & தரவு வகைகள்" },
    summary: {
      en: "Store values in named boxes and know what kind of value each box holds.",
      ta: "மதிப்புகளைப் பெயரிட்ட பெட்டிகளில் சேமித்து, ஒவ்வொன்றிலும் எந்த வகை மதிப்பு உள்ளது என்பதை அறிதல்.",
    },
    keywords: ["variable", "variables", "data type", "datatype", "int", "float", "str", "assign", "assignment", "type(", "bool", "boolean", "மாறி"],
    simple: {
      en: "A variable is a named box that holds a value. You put a value in with `=`. Every value has a type: whole numbers are `int`, decimals are `float`, text is `str`, and True/False is `bool`.",
      ta: "மாறி என்பது ஒரு மதிப்பை வைத்திருக்கும் பெயரிட்ட பெட்டி. `=` குறியால் மதிப்பை உள்ளே வைக்கிறோம். ஒவ்வொரு மதிப்புக்கும் ஒரு வகை உண்டு: முழு எண் `int`, தசம எண் `float`, எழுத்து `str`, உண்மை/பொய் `bool`.",
    },
    steps: {
      en: ["Pick a clear name, like `age`.", "Use `=` to store a value: `age = 10`.", "Use the name later to read the value: `print(age)`.", "Check the type with `type(age)` if you are unsure."],
      ta: ["`age` போன்ற தெளிவான பெயரைத் தேர்வு செய்யுங்கள்.", "`=` பயன்படுத்தி மதிப்பைச் சேமியுங்கள்: `age = 10`.", "பின்னர் அதே பெயரால் மதிப்பைப் படியுங்கள்: `print(age)`.", "சந்தேகம் இருந்தால் `type(age)` மூலம் வகையைச் சரிபாருங்கள்."],
    },
    example: {
      code: 'name = "Asha"\nage = 17\nheight = 1.62\nis_student = True\nprint(name, age, height, is_student)',
      explain: {
        en: "Four variables hold four different types: text, a whole number, a decimal and True/False. `print` shows them all.",
        ta: "நான்கு மாறிகள் நான்கு வெவ்வேறு வகைகளை வைத்துள்ளன: எழுத்து, முழு எண், தசம எண், உண்மை/பொய். `print` அனைத்தையும் காட்டும்.",
      },
    },
    mistakes: {
      en: ["Writing `10 = age` (the name goes on the left).", "Mixing text and numbers: `\"5\" + 2` causes an error."],
      ta: ["`10 = age` என்று எழுதுதல் (பெயர் இடப்பக்கம் வர வேண்டும்).", "எழுத்தையும் எண்ணையும் கலத்தல்: `\"5\" + 2` பிழை தரும்."],
    },
  },
  {
    id: "conditionals",
    order: 2,
    icon: "GitBranch",
    prerequisites: ["variables"],
    title: { en: "Conditions (if / else)", ta: "நிபந்தனைகள் (if / else)" },
    summary: {
      en: "Make your program choose between different paths.",
      ta: "உங்கள் நிரல் வெவ்வேறு பாதைகளில் ஒன்றைத் தேர்வு செய்யச் செய்தல்.",
    },
    keywords: ["if statement", "if-else", "if else", "elif", "else", "condition", "conditional", "comparison", "boolean logic", "decision", "நிபந்தனை"],
    simple: {
      en: "An `if` statement asks a yes/no question. If the answer is yes (True), the indented code under it runs. `else` runs when the answer is no. `elif` lets you ask another question.",
      ta: "`if` என்பது ஆம்/இல்லை கேள்வி கேட்கும். பதில் ஆம் (True) எனில் அதன் கீழ் உள்ள உள்தள்ளிய குறியீடு இயங்கும். இல்லை எனில் `else` இயங்கும். மற்றொரு கேள்விக்கு `elif` பயன்படும்.",
    },
    steps: {
      en: ["Write the question: `if marks >= 40:`.", "Indent the code that should run when it is True.", "Add `else:` for the other case.", "Use `elif` for extra cases between them."],
      ta: ["கேள்வியை எழுதுங்கள்: `if marks >= 40:`.", "அது True ஆனால் இயங்க வேண்டிய குறியீட்டை உள்தள்ளுங்கள்.", "மற்ற நிலைக்கு `else:` சேர்க்கவும்.", "இடையில் கூடுதல் நிலைகளுக்கு `elif` பயன்படுத்தவும்."],
    },
    example: {
      code: 'marks = 72\nif marks >= 75:\n    print("Distinction")\nelif marks >= 40:\n    print("Pass")\nelse:\n    print("Try again")',
      explain: {
        en: "Python checks from top to bottom and runs only the first block whose condition is True. Here 72 is not >= 75 but is >= 40, so it prints Pass.",
        ta: "Python மேலிருந்து கீழாகச் சோதித்து, முதலில் True ஆகும் தொகுதியை மட்டும் இயக்கும். இங்கு 72, 75-ஐ விடக் குறைவு ஆனால் 40-ஐ விட அதிகம்; எனவே Pass வெளிவரும்.",
      },
    },
    mistakes: {
      en: ["Using `=` (assign) instead of `==` (compare).", "Forgetting the colon `:` or the indentation."],
      ta: ["`==` (ஒப்பிடுதல்) என்பதற்குப் பதிலாக `=` (ஒதுக்குதல்) பயன்படுத்துதல்.", "கோலன் `:` அல்லது உள்தள்ளலை மறத்தல்."],
    },
  },
  {
    id: "loops",
    order: 3,
    icon: "Repeat",
    prerequisites: ["conditionals"],
    title: { en: "Loops (for / while)", ta: "லூப்கள் (for / while)" },
    summary: {
      en: "Repeat work without copying code.",
      ta: "குறியீட்டை நகலெடுக்காமல் வேலையைத் திரும்பத் திரும்பச் செய்தல்.",
    },
    keywords: ["loop", "loops", "for loop", "while", "range", "iterate", "iteration", "repeat", "break", "continue", "infinite", "லூப்"],
    simple: {
      en: "A loop repeats a block of code. `for` loops run a known number of times, such as `range(5)`. `while` loops keep going as long as a condition stays True, so something inside must eventually make it False.",
      ta: "லூப் ஒரு குறியீட்டுத் தொகுதியைத் திரும்பத் திரும்ப இயக்கும். `for` லூப் `range(5)` போல தெரிந்த எண்ணிக்கையில் இயங்கும். `while` லூப் நிபந்தனை True ஆக இருக்கும் வரை தொடரும்; எனவே உள்ளே ஏதாவது ஒன்று அதை False ஆக்க வேண்டும்.",
    },
    steps: {
      en: ["Decide what must repeat.", "Use `for i in range(n):` when you know how many times.", "Use `while condition:` when you repeat until something changes.", "Make sure a `while` loop changes something so it can stop."],
      ta: ["எது திரும்பத் திரும்ப நடக்க வேண்டும் என்று தீர்மானியுங்கள்.", "எத்தனை முறை என்று தெரிந்தால் `for i in range(n):` பயன்படுத்துங்கள்.", "ஏதாவது மாறும் வரை என்றால் `while condition:` பயன்படுத்துங்கள்.", "`while` லூப் நிற்க, உள்ளே ஏதாவது ஒன்றை மாற்றுவதை உறுதி செய்யுங்கள்."],
    },
    example: {
      code: "total = 0\nfor n in range(1, 6):\n    total += n\nprint(total)  # 15",
      explain: {
        en: "The loop visits 1, 2, 3, 4, 5 and adds each into `total`, so the result is 15. Note `range(1, 6)` stops BEFORE 6.",
        ta: "லூப் 1, 2, 3, 4, 5 ஆகியவற்றைப் பார்த்து ஒவ்வொன்றையும் `total`-இல் கூட்டும்; முடிவு 15. `range(1, 6)` என்பது 6-க்கு முன்பே நின்றுவிடும்.",
      },
    },
    mistakes: {
      en: ["Forgetting `i += 1` in a `while` loop (infinite loop).", "Off-by-one errors: `range(5)` gives 0 to 4, not 1 to 5."],
      ta: ["`while` லூப்பில் `i += 1` மறத்தல் (முடிவில்லா லூப்).", "ஒன்று கூடுதல்/குறைவு பிழை: `range(5)` என்பது 0 முதல் 4 வரை, 1 முதல் 5 அல்ல."],
    },
  },
  {
    id: "strings",
    order: 4,
    icon: "Type",
    prerequisites: ["variables"],
    title: { en: "Strings (Text)", ta: "ஸ்ட்ரிங்குகள் (எழுத்து)" },
    summary: {
      en: "Work with text: length, characters, slicing and common methods.",
      ta: "எழுத்துடன் வேலை: நீளம், எழுத்துகள், துண்டாக்குதல், பொதுவான முறைகள்.",
    },
    keywords: ["string", "strings", "slice", "slicing", "len", "upper", "lower", "split", "join", "substring", "character", "ஸ்ட்ரிங்"],
    simple: {
      en: "A string is text in quotes. Each character has a position number (index) starting from 0. You can slice part of it with `s[start:stop]` and use methods like `.upper()` and `.split()`.",
      ta: "ஸ்ட்ரிங் என்பது மேற்கோளில் உள்ள எழுத்து. ஒவ்வொரு எழுத்துக்கும் 0-இல் தொடங்கும் இடஎண் (index) உண்டு. `s[start:stop]` மூலம் ஒரு பகுதியை வெட்டலாம்; `.upper()`, `.split()` போன்ற முறைகளையும் பயன்படுத்தலாம்.",
    },
    steps: {
      en: ["Create it: `s = \"python\"`.", "Count characters with `len(s)`.", "Pick one with `s[0]` (first) or `s[-1]` (last).", "Cut a piece with `s[1:4]` (stop is not included)."],
      ta: ["உருவாக்குங்கள்: `s = \"python\"`.", "`len(s)` மூலம் எழுத்துகளை எண்ணுங்கள்.", "`s[0]` (முதல்) அல்லது `s[-1]` (கடைசி) மூலம் ஒன்றைத் தேர்வு செய்யுங்கள்.", "`s[1:4]` மூலம் ஒரு துண்டை வெட்டுங்கள் (stop சேராது)."],
    },
    example: {
      code: 's = "eduverse"\nprint(len(s))\nprint(s.upper())\nprint(s[0:6])\nprint(s.split(" "))',
      explain: {
        en: "Prints 8, then EDUVERSE, then eduver, then ['eduverse'].",
        ta: "8, பின்னர் EDUVERSE, பின்னர் eduver, பின்னர் ['eduverse'] ஆகியவற்றை வெளியிடும்.",
      },
    },
    mistakes: {
      en: ["Thinking the first index is 1 (it is 0).", "Trying to change one character: strings cannot be edited in place."],
      ta: ["முதல் index 1 என்று நினைத்தல் (அது 0).", "ஒரு எழுத்தை மாற்ற முயல்தல்: ஸ்ட்ரிங்கை நேரடியாகத் திருத்த முடியாது."],
    },
  },
  {
    id: "lists",
    order: 5,
    icon: "List",
    prerequisites: ["loops"],
    title: { en: "Lists & Arrays", ta: "லிஸ்ட்கள் & அணிகள்" },
    summary: {
      en: "Keep many values together in one variable.",
      ta: "பல மதிப்புகளை ஒரே மாறியில் சேர்த்து வைத்தல்.",
    },
    keywords: ["list", "lists", "array", "arrays", "append", "indexing", "element", "comprehension", "nums", "லிஸ்ட்"],
    simple: {
      en: "A list holds many values in order, like `[4, 8, 15]`. Use `nums[0]` for the first item and `nums.append(x)` to add one. Two names can point to the SAME list, so changing one changes both.",
      ta: "லிஸ்ட் பல மதிப்புகளை வரிசையாக வைத்திருக்கும், எ.கா. `[4, 8, 15]`. முதல் உருப்படிக்கு `nums[0]`; புதியதைச் சேர்க்க `nums.append(x)`. இரு பெயர்கள் ஒரே லிஸ்ட்டைச் சுட்டலாம்; எனவே ஒன்றை மாற்றினால் இரண்டும் மாறும்.",
    },
    steps: {
      en: ["Make a list with square brackets.", "Read items by index: `nums[0]`, `nums[-1]`.", "Add with `append`, remove with `remove` or `pop`.", "Loop over it: `for x in nums:`."],
      ta: ["சதுர அடைப்புக்குறிகளால் லிஸ்ட் உருவாக்குங்கள்.", "index மூலம் படியுங்கள்: `nums[0]`, `nums[-1]`.", "`append` மூலம் சேர்க்கவும்; `remove` அல்லது `pop` மூலம் நீக்கவும்.", "`for x in nums:` மூலம் சுற்றி வாருங்கள்."],
    },
    example: {
      code: "nums = [4, 8, 15]\nnums.append(16)\nprint(len(nums))   # 4\nprint(nums[-1])    # 16\nsquares = [n * n for n in nums]\nprint(squares)",
      explain: {
        en: "We add 16, so the list has 4 items and the last one is 16. The last line builds a new list of squares.",
        ta: "16-ஐச் சேர்த்ததால் லிஸ்டில் 4 உருப்படிகள் உள்ளன; கடைசி உருப்படி 16. கடைசி வரி வர்க்கங்களின் புதிய லிஸ்டை உருவாக்கும்.",
      },
    },
    mistakes: {
      en: ["Index out of range: a list of 3 items has indexes 0, 1, 2.", "Using `b = a` and expecting a separate copy (use `a.copy()`)."],
      ta: ["இடஎண் வரம்பு மீறல்: 3 உருப்படி கொண்ட லிஸ்டுக்கு index 0, 1, 2 மட்டுமே.", "`b = a` எழுதிவிட்டு தனி நகல் என நினைத்தல் (`a.copy()` பயன்படுத்தவும்)."],
    },
  },
  {
    id: "functions",
    order: 6,
    icon: "Braces",
    prerequisites: ["loops"],
    title: { en: "Functions", ta: "செயல்பாடுகள் (Functions)" },
    summary: {
      en: "Package code with a name so you can reuse it.",
      ta: "குறியீட்டுக்குப் பெயரிட்டு மீண்டும் பயன்படுத்தும் வகையில் தொகுத்தல்.",
    },
    keywords: ["function", "functions", "def", "return", "parameter", "argument", "recursion", "recursive", "lambda", "scope", "செயல்பாடு"],
    simple: {
      en: "A function is a named recipe. You define it once with `def`, give it inputs (parameters), and it can send back an answer with `return`. Then you call it by name as many times as you like.",
      ta: "செயல்பாடு என்பது பெயரிட்ட செய்முறை. `def` மூலம் ஒரு முறை வரையறுத்து, உள்ளீடுகளை (parameters) கொடுத்து, `return` மூலம் விடையை அனுப்பலாம். பின்னர் பெயரால் எத்தனை முறையும் அழைக்கலாம்.",
    },
    steps: {
      en: ["Start with `def name(parameters):`.", "Write the body, indented.", "Send the result back with `return`.", "Call it: `name(arguments)`."],
      ta: ["`def name(parameters):` என்று தொடங்குங்கள்.", "உள்தள்ளி உடலை எழுதுங்கள்.", "`return` மூலம் முடிவை அனுப்புங்கள்.", "அழையுங்கள்: `name(arguments)`."],
    },
    example: {
      code: "def add(a, b):\n    return a + b\n\nprint(add(2, 3))   # 5\nprint(add(10, 5))  # 15",
      explain: {
        en: "`add` takes two inputs and returns their sum. Calling it twice reuses the same code with different values.",
        ta: "`add` இரு உள்ளீடுகளை எடுத்து அவற்றின் கூட்டுத்தொகையைத் தரும். இருமுறை அழைத்தால் ஒரே குறியீடு வெவ்வேறு மதிப்புகளுடன் மீண்டும் பயன்படும்.",
      },
    },
    mistakes: {
      en: ["Using `print` instead of `return` and then getting `None`.", "Defining a function but never calling it."],
      ta: ["`return` என்பதற்குப் பதிலாக `print` பயன்படுத்தி `None` பெறுதல்.", "செயல்பாட்டை வரையறுத்து விட்டு அழைக்காமல் இருத்தல்."],
    },
  },
];

// ---------------------------------------------------------------------------
// Question bank. options[0] is the correct answer (the engine shuffles).
// ---------------------------------------------------------------------------
const Q = (id, topic, level, q, options, explain, optionsTa) => ({
  id, topic, level, q, options, explain, ...(optionsTa ? { optionsTa } : {}),
});

const QUESTIONS = [
  // ---- variables
  Q("var-e1", "variables", "easy",
    { en: "Which line stores the number 10 in a variable named `age` (Python)?", ta: "Python-இல் `age` என்ற மாறியில் 10 என்ற எண்ணைச் சேமிக்கும் வரி எது?" },
    ["age = 10", "10 = age", "int age := 10", "store age 10"],
    { en: "In Python the variable name goes on the left of `=` and the value on the right.", ta: "Python-இல் மாறியின் பெயர் `=`-இன் இடப்பக்கமும், மதிப்பு வலப்பக்கமும் வரும்." }),
  Q("var-e2", "variables", "easy",
    { en: "What type of value is `\"Hello\"` in Python?", ta: "Python-இல் `\"Hello\"` என்பது எந்த வகை மதிப்பு?" },
    ["str", "int", "float", "bool"],
    { en: "Anything inside quotes is text, called a string (`str`).", ta: "மேற்கோளுக்குள் இருப்பது எழுத்து; அதற்கு ஸ்ட்ரிங் (`str`) என்று பெயர்." }),
  Q("var-m1", "variables", "medium",
    { en: "What does this print?\n```\nx = 5\ny = 2\nprint(x // y)\n```", ta: "இது என்ன வெளியிடும்?\n```\nx = 5\ny = 2\nprint(x // y)\n```" },
    ["2", "2.5", "3", "2.0"],
    { en: "`//` is floor division: 5 divided by 2 is 2.5, and flooring gives the whole number 2.", ta: "`//` என்பது தளப் வகுத்தல்: 5-ஐ 2-ஆல் வகுத்தால் 2.5; தளமாக்கினால் முழு எண் 2." }),
  Q("var-m2", "variables", "medium",
    { en: "What does `type(7 / 2)` give in Python 3?", ta: "Python 3-இல் `type(7 / 2)` என்ன தரும்?" },
    ["float", "int", "str", "bool"],
    { en: "The `/` operator always gives a decimal result in Python 3: 7 / 2 is 3.5, a float.", ta: "Python 3-இல் `/` எப்போதும் தசம முடிவைத் தரும்: 7 / 2 = 3.5, அது float." }),
  Q("var-h1", "variables", "hard",
    { en: "What is `b` at the end?\n```\na = 4\nb = a\na = 9\n```", ta: "இறுதியில் `b`-இன் மதிப்பு என்ன?\n```\na = 4\nb = a\na = 9\n```" },
    ["4", "9", "13", "Error"],
    { en: "`b = a` copies the value 4 at that moment. Changing `a` later to 9 does not change `b`.", ta: "`b = a` என்பது அந்த நேரத்தில் உள்ள மதிப்பு 4-ஐ நகலெடுக்கும். பின்னர் `a`-ஐ 9 ஆக்கினாலும் `b` மாறாது." }),
  Q("var-h2", "variables", "hard",
    { en: "What does this print?\n```\nx = '5'\nprint(x * 3)\n```", ta: "இது என்ன வெளியிடும்?\n```\nx = '5'\nprint(x * 3)\n```" },
    ["555", "15", "8", "Error"],
    { en: "`x` is the text '5'. Multiplying text by 3 repeats it three times: 555.", ta: "`x` என்பது எழுத்து '5'. எழுத்தை 3-ஆல் பெருக்கினால் மூன்று முறை திரும்பும்: 555." }),

  // ---- conditionals
  Q("con-e1", "conditionals", "easy",
    { en: "Which keyword checks a condition in Python?", ta: "Python-இல் நிபந்தனையைச் சோதிக்கும் சொல் எது?" },
    ["if", "for", "def", "print"],
    { en: "`if` runs its block only when the condition is True.", ta: "நிபந்தனை True ஆனால் மட்டுமே `if` அதன் தொகுதியை இயக்கும்." }),
  Q("con-e2", "conditionals", "easy",
    { en: "Which expression checks whether `a` equals `b`?", ta: "`a`, `b` சமமா என்று சோதிக்கும் கோவை எது?" },
    ["a == b", "a = b", "a := b", "a === b"],
    { en: "`==` compares two values. A single `=` assigns a value.", ta: "`==` இரு மதிப்புகளை ஒப்பிடும். ஒற்றை `=` மதிப்பை ஒதுக்கும்." }),
  Q("con-m1", "conditionals", "medium",
    { en: "What prints?\n```\nx = 7\nif x > 5:\n    print('big')\nelse:\n    print('small')\n```", ta: "என்ன வெளிவரும்?\n```\nx = 7\nif x > 5:\n    print('big')\nelse:\n    print('small')\n```" },
    ["big", "small", "Nothing", "Error"],
    { en: "7 is greater than 5, so the `if` block runs and prints big.", ta: "7, 5-ஐ விடப் பெரியது; எனவே `if` தொகுதி இயங்கி big வெளிவரும்." }),
  Q("con-m2", "conditionals", "medium",
    { en: "Which line is TRUE only when `x` is between 0 and 10?", ta: "`x` 0-க்கும் 10-க்கும் இடையில் இருந்தால் மட்டும் True ஆகும் வரி எது?" },
    ["if x > 0 and x < 10:", "if x > 0 or x < 10:", "if x > 0 & < 10:", "if (x > 0, x < 10):"],
    { en: "`and` needs BOTH parts to be True. `or` would be True for almost any number.", ta: "`and` இரண்டு பகுதிகளும் True ஆக வேண்டும். `or` கிட்டத்தட்ட எல்லா எண்ணுக்கும் True ஆகும்." }),
  Q("con-h1", "conditionals", "hard",
    { en: "x is 15. What prints?\n```\nif x > 20:\n    print('A')\nelif x > 10:\n    print('B')\nelse:\n    print('C')\n```", ta: "x = 15. என்ன வெளிவரும்?\n```\nif x > 20:\n    print('A')\nelif x > 10:\n    print('B')\nelse:\n    print('C')\n```" },
    ["B", "A", "C", "A and B"],
    { en: "15 is not > 20, but it is > 10, so the `elif` block runs and the rest is skipped.", ta: "15, 20-ஐ விடப் பெரியதல்ல; ஆனால் 10-ஐ விடப் பெரியது; எனவே `elif` தொகுதி இயங்கும், மற்றவை தவிர்க்கப்படும்." }),
  Q("con-h2", "conditionals", "hard",
    { en: "What is the value of `not (True and False)`?", ta: "`not (True and False)` என்பதன் மதிப்பு என்ன?" },
    ["True", "False", "None", "Error"],
    { en: "`True and False` is False, and `not False` is True.", ta: "`True and False` என்பது False; `not False` என்பது True." }),

  // ---- loops
  Q("loop-e1", "loops", "easy",
    { en: "How many times does the body of `for i in range(3):` run?", ta: "`for i in range(3):` என்பதன் உடல் எத்தனை முறை இயங்கும்?" },
    ["3", "2", "4", "Forever"],
    { en: "`range(3)` gives 0, 1, 2 — three values, so three runs.", ta: "`range(3)` என்பது 0, 1, 2 — மூன்று மதிப்புகள்; எனவே மூன்று முறை." },
    ["3", "2", "4", "முடிவில்லாமல்"]),
  Q("loop-e2", "loops", "easy",
    { en: "Which keyword stops a loop immediately?", ta: "லூப்பை உடனே நிறுத்தும் சொல் எது?" },
    ["break", "continue", "pass", "stop"],
    { en: "`break` exits the loop. `continue` only skips to the next round.", ta: "`break` லூப்பை விட்டு வெளியேறும். `continue` அடுத்த சுற்றுக்கு மட்டும் தாவும்." }),
  Q("loop-m1", "loops", "medium",
    { en: "What does this print?\n```\nfor i in range(1, 4):\n    print(i)\n```", ta: "இது என்ன வெளியிடும்?\n```\nfor i in range(1, 4):\n    print(i)\n```" },
    ["1, 2, 3 (one per line)", "0, 1, 2, 3", "1, 2, 3, 4", "3"],
    { en: "`range(1, 4)` starts at 1 and stops BEFORE 4, giving 1, 2, 3.", ta: "`range(1, 4)` 1-இல் தொடங்கி 4-க்கு முன்பே நிற்கும்: 1, 2, 3." },
    ["1, 2, 3 (ஒவ்வொன்றும் தனி வரியில்)", "0, 1, 2, 3", "1, 2, 3, 4", "3"]),
  Q("loop-m2", "loops", "medium",
    { en: "What does this print?\n```\ntotal = 0\nfor n in [1, 2, 3]:\n    total += n\nprint(total)\n```", ta: "இது என்ன வெளியிடும்?\n```\ntotal = 0\nfor n in [1, 2, 3]:\n    total += n\nprint(total)\n```" },
    ["6", "3", "123", "0"],
    { en: "The loop adds 1, then 2, then 3 into `total`: 0+1+2+3 = 6.", ta: "லூப் 1, 2, 3 ஆகியவற்றை `total`-இல் கூட்டும்: 0+1+2+3 = 6." }),
  Q("loop-h1", "loops", "hard",
    { en: "What happens here?\n```\ni = 0\nwhile i < 3:\n    print(i)\n```", ta: "இங்கு என்ன நடக்கும்?\n```\ni = 0\nwhile i < 3:\n    print(i)\n```" },
    ["Infinite loop", "Prints 0, 1, 2", "Prints nothing", "Prints 0 once"],
    { en: "`i` never changes, so `i < 3` stays True forever. You need `i += 1` inside the loop.", ta: "`i` மாறவே இல்லை; எனவே `i < 3` எப்போதும் True. லூப்பினுள் `i += 1` தேவை." },
    ["முடிவில்லா லூப்", "0, 1, 2 வெளிவரும்", "எதுவும் வெளிவராது", "0 ஒரு முறை வெளிவரும்"]),
  Q("loop-h2", "loops", "hard",
    { en: "What does this print?\n```\nfor i in range(5):\n    if i == 2:\n        continue\n    print(i, end=' ')\n```", ta: "இது என்ன வெளியிடும்?\n```\nfor i in range(5):\n    if i == 2:\n        continue\n    print(i, end=' ')\n```" },
    ["0 1 3 4", "0 1 2 3 4", "0 1", "3 4"],
    { en: "`continue` skips the rest of that round only when i is 2, so 2 is missing.", ta: "i = 2 ஆக இருக்கும்போது மட்டும் `continue` அந்தச் சுற்றின் மீதியைத் தவிர்க்கும்; எனவே 2 வராது." }),

  // ---- strings
  Q("str-e1", "strings", "easy",
    { en: "What does `len('code')` return?", ta: "`len('code')` என்ன தரும்?" },
    ["4", "3", "5", "code"],
    { en: "`len` counts characters: c, o, d, e = 4.", ta: "`len` எழுத்துகளை எண்ணும்: c, o, d, e = 4." }),
  Q("str-e2", "strings", "easy",
    { en: "Which makes `'hello'` uppercase?", ta: "`'hello'`-ஐ பெரிய எழுத்தாக்குவது எது?" },
    ["'hello'.upper()", "upper('hello')", "'hello'.big()", "'hello'.cap()"],
    { en: "Strings have a method called `.upper()`.", ta: "ஸ்ட்ரிங்குகளுக்கு `.upper()` என்ற முறை உண்டு." }),
  Q("str-m1", "strings", "medium",
    { en: "If `s = 'python'`, what is `s[0]`?", ta: "`s = 'python'` எனில், `s[0]` என்ன?" },
    ["p", "y", "python", "n"],
    { en: "Indexes start at 0, so `s[0]` is the first character, p.", ta: "index 0-இல் தொடங்கும்; எனவே `s[0]` முதல் எழுத்து p." }),
  Q("str-m2", "strings", "medium",
    { en: "What does `'a,b,c'.split(',')` return?", ta: "`'a,b,c'.split(',')` என்ன தரும்?" },
    ["['a', 'b', 'c']", "'abc'", "['a,b,c']", "('a', 'b', 'c')"],
    { en: "`split` cuts the text at every comma and returns a list of the pieces.", ta: "`split` ஒவ்வொரு கமாவிலும் எழுத்தை வெட்டி, துண்டுகளின் லிஸ்டைத் தரும்." }),
  Q("str-h1", "strings", "hard",
    { en: "If `s = 'coding'`, what is `s[1:4]`?", ta: "`s = 'coding'` எனில், `s[1:4]` என்ன?" },
    ["odi", "cod", "odin", "ding"],
    { en: "Slice 1:4 takes indexes 1, 2, 3 (o, d, i). The stop index 4 is not included.", ta: "1:4 என்பது index 1, 2, 3 (o, d, i) ஐ எடுக்கும். stop index 4 சேராது." }),
  Q("str-h2", "strings", "hard",
    { en: "What is `s[::-1]` when `s = 'abc'`?", ta: "`s = 'abc'` எனில் `s[::-1]` என்ன?" },
    ["cba", "abc", "bca", "Error"],
    { en: "A step of -1 walks the string backwards, so it reverses it.", ta: "-1 படி என்பது ஸ்ட்ரிங்கைப் பின்னோக்கிச் செல்லும்; எனவே அது தலைகீழாகும்." }),

  // ---- lists
  Q("lst-e1", "lists", "easy",
    { en: "How do you get the first item of a list called `nums`?", ta: "`nums` என்ற லிஸ்டின் முதல் உருப்படியைப் பெறுவது எப்படி?" },
    ["nums[0]", "nums[1]", "nums.first", "nums(0)"],
    { en: "List positions start at 0, written with square brackets.", ta: "லிஸ்ட் இடங்கள் 0-இல் தொடங்கும்; சதுர அடைப்புக்குறியில் எழுதப்படும்." }),
  Q("lst-e2", "lists", "easy",
    { en: "Which method adds an item to the end of a list?", ta: "லிஸ்டின் இறுதியில் ஒரு உருப்படியைச் சேர்க்கும் முறை எது?" },
    ["append()", "add()", "push_back()", "insert_end()"],
    { en: "`append` adds to the end. (`push_back` belongs to C++ vectors.)", ta: "`append` இறுதியில் சேர்க்கும். (`push_back` என்பது C++ vector-க்குரியது.)" }),
  Q("lst-m1", "lists", "medium",
    { en: "If `nums = [4, 8, 15]`, what is `len(nums)`?", ta: "`nums = [4, 8, 15]` எனில் `len(nums)` என்ன?" },
    ["3", "4", "15", "2"],
    { en: "`len` counts items, not their values: there are 3 items.", ta: "`len` உருப்படிகளின் எண்ணிக்கையைத் தரும், மதிப்பை அல்ல: 3 உருப்படிகள்." }),
  Q("lst-m2", "lists", "medium",
    { en: "If `nums = [4, 8, 15]`, what is `nums[-1]`?", ta: "`nums = [4, 8, 15]` எனில் `nums[-1]` என்ன?" },
    ["15", "4", "8", "Error"],
    { en: "A negative index counts from the end, so -1 is the last item.", ta: "எதிர்மறை index இறுதியிலிருந்து எண்ணும்; -1 என்பது கடைசி உருப்படி." }),
  Q("lst-h1", "lists", "hard",
    { en: "What does this print?\n```\na = [1, 2, 3]\nb = a\nb.append(4)\nprint(a)\n```", ta: "இது என்ன வெளியிடும்?\n```\na = [1, 2, 3]\nb = a\nb.append(4)\nprint(a)\n```" },
    ["[1, 2, 3, 4]", "[1, 2, 3]", "[4]", "Error"],
    { en: "`b = a` makes both names point to the SAME list, so appending through `b` also changes `a`.", ta: "`b = a` இரண்டு பெயர்களையும் ஒரே லிஸ்டைச் சுட்டச் செய்யும்; எனவே `b` வழியாகச் சேர்த்தால் `a`-யும் மாறும்." }),
  Q("lst-h2", "lists", "hard",
    { en: "What does `[x * x for x in range(4)]` produce?", ta: "`[x * x for x in range(4)]` என்ன தரும்?" },
    ["[0, 1, 4, 9]", "[1, 4, 9, 16]", "[0, 1, 2, 3]", "[0, 2, 4, 6]"],
    { en: "x takes 0, 1, 2, 3 and each is squared: 0, 1, 4, 9.", ta: "x என்பது 0, 1, 2, 3 ஆகிறது; ஒவ்வொன்றும் வர்க்கமாகிறது: 0, 1, 4, 9." }),

  // ---- functions
  Q("fn-e1", "functions", "easy",
    { en: "Which keyword defines a function in Python?", ta: "Python-இல் செயல்பாட்டை வரையறுக்கும் சொல் எது?" },
    ["def", "func", "function", "define"],
    { en: "Python uses `def`, short for define.", ta: "Python `def` (define-இன் சுருக்கம்) பயன்படுத்தும்." }),
  Q("fn-e2", "functions", "easy",
    { en: "What does `square(4)` give?\n```\ndef square(n):\n    return n * n\n```", ta: "`square(4)` என்ன தரும்?\n```\ndef square(n):\n    return n * n\n```" },
    ["16", "8", "4", "Error"],
    { en: "`n` is 4, and `return n * n` sends back 4 × 4 = 16.", ta: "`n` = 4; `return n * n` என்பது 4 × 4 = 16-ஐத் திருப்பி அனுப்பும்." }),
  Q("fn-m1", "functions", "medium",
    { en: "What does this print?\n```\ndef add(a, b):\n    return a + b\nprint(add(2, 3))\n```", ta: "இது என்ன வெளியிடும்?\n```\ndef add(a, b):\n    return a + b\nprint(add(2, 3))\n```" },
    ["5", "23", "None", "Error"],
    { en: "`add(2, 3)` returns 2 + 3 = 5 and `print` shows it.", ta: "`add(2, 3)` 2 + 3 = 5-ஐத் தரும்; `print` அதைக் காட்டும்." }),
  Q("fn-m2", "functions", "medium",
    { en: "What does this print?\n```\ndef power(base, exp):\n    return base ** exp\nprint(power(2, 3))\n```", ta: "இது என்ன வெளியிடும்?\n```\ndef power(base, exp):\n    return base ** exp\nprint(power(2, 3))\n```" },
    ["8", "6", "5", "9"],
    { en: "`**` means power: 2 to the power 3 is 2 × 2 × 2 = 8.", ta: "`**` என்பது அடுக்கு: 2-இன் 3-ஆம் அடுக்கு = 2 × 2 × 2 = 8." }),
  Q("fn-h1", "functions", "hard",
    { en: "What is printed in total?\n```\ndef hello():\n    print('Hi')\nx = hello()\nprint(x)\n```", ta: "மொத்தத்தில் என்ன வெளிவரும்?\n```\ndef hello():\n    print('Hi')\nx = hello()\nprint(x)\n```" },
    ["Hi, then None", "Hi, then Hi", "None only", "Error"],
    { en: "`hello` prints Hi but has no `return`, so it returns None. Then `print(x)` prints None.", ta: "`hello` Hi-ஐ அச்சிடும்; ஆனால் `return` இல்லாததால் None-ஐத் தரும். பின்னர் `print(x)` None-ஐ அச்சிடும்." }),
  Q("fn-h2", "functions", "hard",
    { en: "What does this print?\n```\ndef f(n):\n    if n == 0:\n        return 0\n    return n + f(n - 1)\nprint(f(3))\n```", ta: "இது என்ன வெளியிடும்?\n```\ndef f(n):\n    if n == 0:\n        return 0\n    return n + f(n - 1)\nprint(f(3))\n```" },
    ["6", "3", "0", "Infinite recursion"],
    { en: "f(3) = 3 + f(2) = 3 + 2 + f(1) = 3 + 2 + 1 + f(0) = 6. The `n == 0` case stops it.", ta: "f(3) = 3 + f(2) = 3 + 2 + f(1) = 3 + 2 + 1 + f(0) = 6. `n == 0` நிலை அதை நிறுத்தும்." }),
];

// ---------------------------------------------------------------------------
// Glossary used by the offline (no API key) simplifier.
// ---------------------------------------------------------------------------
const GLOSSARY = [
  { term: "variable", en: "a named box that stores a value", ta: "ஒரு மதிப்பைச் சேமிக்கும் பெயரிட்ட பெட்டி" },
  { term: "data type", en: "the kind of value, such as number or text", ta: "எண் அல்லது எழுத்து போன்ற மதிப்பின் வகை" },
  { term: "integer", en: "a whole number like 5 or -2", ta: "5 அல்லது -2 போன்ற முழு எண்" },
  { term: "float", en: "a number with a decimal point", ta: "தசமப் புள்ளி உள்ள எண்" },
  { term: "string", en: "text written inside quotes", ta: "மேற்கோளுக்குள் எழுதிய எழுத்து" },
  { term: "boolean", en: "a value that is only True or False", ta: "True அல்லது False மட்டுமே ஆகும் மதிப்பு" },
  { term: "function", en: "a named block of code you can reuse", ta: "மீண்டும் பயன்படுத்தக்கூடிய பெயரிட்ட குறியீட்டுத் தொகுதி" },
  { term: "parameter", en: "an input name listed in a function definition", ta: "செயல்பாட்டு வரையறையில் உள்ள உள்ளீட்டுப் பெயர்" },
  { term: "argument", en: "the actual value you pass into a function", ta: "செயல்பாட்டுக்குள் அனுப்பும் உண்மையான மதிப்பு" },
  { term: "return value", en: "the answer a function sends back", ta: "செயல்பாடு திருப்பி அனுப்பும் விடை" },
  { term: "loop", en: "code that repeats", ta: "திரும்பத் திரும்ப இயங்கும் குறியீடு" },
  { term: "iteration", en: "one round of a loop", ta: "லூப்பின் ஒரு சுற்று" },
  { term: "condition", en: "a yes/no question the program checks", ta: "நிரல் சோதிக்கும் ஆம்/இல்லை கேள்வி" },
  { term: "expression", en: "a piece of code that produces a value", ta: "ஒரு மதிப்பை உருவாக்கும் குறியீட்டுத் துண்டு" },
  { term: "statement", en: "one instruction for the computer", ta: "கணினிக்கான ஒரு கட்டளை" },
  { term: "operator", en: "a symbol that does an action, like + or ==", ta: "+ அல்லது == போன்ற செயலைச் செய்யும் குறியீடு" },
  { term: "list", en: "an ordered collection of values", ta: "வரிசையாக உள்ள மதிப்புகளின் தொகுப்பு" },
  { term: "array", en: "a numbered row of values of the same kind", ta: "ஒரே வகை மதிப்புகள் கொண்ட எண்ணிடப்பட்ட வரிசை" },
  { term: "index", en: "the position number of an item, starting at 0", ta: "0-இல் தொடங்கும் உருப்படியின் இட எண்" },
  { term: "recursion", en: "a function that calls itself to solve a smaller problem", ta: "சிறிய சிக்கலைத் தீர்க்கத் தன்னையே அழைக்கும் செயல்பாடு" },
  { term: "algorithm", en: "a step-by-step plan to solve a problem", ta: "சிக்கலைத் தீர்க்கும் படிப்படியான திட்டம்" },
  { term: "syntax", en: "the grammar rules of a programming language", ta: "நிரலாக்க மொழியின் இலக்கண விதிகள்" },
  { term: "compiler", en: "a tool that translates your whole program before it runs", ta: "நிரல் இயங்கும் முன் முழுவதையும் மொழிபெயர்க்கும் கருவி" },
  { term: "interpreter", en: "a tool that runs your program line by line", ta: "நிரலை வரி வரியாக இயக்கும் கருவி" },
  { term: "debug", en: "to find and fix mistakes in code", ta: "குறியீட்டில் உள்ள தவறுகளைக் கண்டுபிடித்துத் திருத்துதல்" },
  { term: "exception", en: "an error that happens while the program runs", ta: "நிரல் இயங்கும்போது ஏற்படும் பிழை" },
  { term: "class", en: "a blueprint for making objects", ta: "பொருட்களை உருவாக்குவதற்கான வரைபடம்" },
  { term: "object", en: "a thing made from a class, with data and actions", ta: "ஒரு class-இலிருந்து உருவாகும் தரவும் செயல்களும் கொண்ட பொருள்" },
  { term: "method", en: "a function that belongs to an object or class", ta: "ஒரு object அல்லது class-க்குச் சொந்தமான செயல்பாடு" },
  { term: "scope", en: "the part of the program where a name can be used", ta: "ஒரு பெயரைப் பயன்படுத்தக்கூடிய நிரலின் பகுதி" },
  { term: "module", en: "a file of ready-made code you can import", ta: "இறக்குமதி செய்யக்கூடிய தயாரான குறியீட்டுக் கோப்பு" },
  { term: "library", en: "a collection of ready-made code", ta: "தயாரான குறியீடுகளின் தொகுப்பு" },
  { term: "API", en: "a way for one program to ask another for help", ta: "ஒரு நிரல் மற்றொன்றிடம் உதவி கேட்கும் வழி" },
  { term: "comment", en: "a note for humans that the computer ignores", ta: "கணினி புறக்கணிக்கும், மனிதருக்கான குறிப்பு" },
  { term: "input", en: "data given to a program", ta: "நிரலுக்குக் கொடுக்கப்படும் தரவு" },
  { term: "output", en: "what a program shows or returns", ta: "நிரல் காட்டும் அல்லது தரும் முடிவு" },
  { term: "None", en: "a special value that means 'nothing'", ta: "'ஒன்றுமில்லை' என்பதைக் குறிக்கும் சிறப்பு மதிப்பு" },
  { term: "concatenate", en: "to join pieces of text together", ta: "எழுத்துத் துண்டுகளை இணைத்தல்" },
  { term: "initialize", en: "to give a variable its first value", ta: "ஒரு மாறிக்கு முதல் மதிப்பைக் கொடுத்தல்" },
  { term: "instantiate", en: "to create an object from a class", ta: "ஒரு class-இலிருந்து object-ஐ உருவாக்குதல்" },
  { term: "immutable", en: "cannot be changed after it is created", ta: "உருவாக்கிய பின் மாற்ற முடியாதது" },
  { term: "mutable", en: "can be changed after it is created", ta: "உருவாக்கிய பின் மாற்றக்கூடியது" },
];

// Plain-word replacements used when simplifying text offline. Each inflection
// is listed explicitly so the replaced sentence stays grammatical.
const PLAIN_WORDS = [
  [/;\s*however,?\s*/gi, ". But "], [/,?\s*however,\s*/gi, ", but "],
  [/\butili[sz]es\b/gi, "uses"], [/\butili[sz]ed\b/gi, "used"], [/\butili[sz]ing\b/gi, "using"], [/\butili[sz]e\b/gi, "use"],
  [/\bsubsequently\b/gi, "then"],
  [/\bin order to\b/gi, "to"],
  [/\bprior to\b/gi, "before"],
  [/\bcommences\b/gi, "starts"], [/\bcommenced\b/gi, "started"], [/\bcommence\b/gi, "start"],
  [/\bterminates\b/gi, "stops"], [/\bterminated\b/gi, "stopped"], [/\bterminate\b/gi, "stop"],
  [/\bapproximately\b/gi, "about"],
  [/\bnumerous\b/gi, "many"],
  [/\bdemonstrates\b/gi, "shows"], [/\bdemonstrated\b/gi, "showed"], [/\bdemonstrate\b/gi, "show"],
  [/\bfacilitates\b/gi, "helps with"], [/\bfacilitate\b/gi, "help with"],
  [/\bimplements\b/gi, "builds"], [/\bimplemented\b/gi, "built"], [/\bimplement\b/gi, "build"],
  [/\bexecutes\b/gi, "runs"], [/\bexecuted\b/gi, "run"], [/\bexecute\b/gi, "run"], [/\bexecution\b/gi, "running"],
  [/\binvokes\b/gi, "calls"], [/\binvoked\b/gi, "called"], [/\binvoke\b/gi, "call"],
  [/\bconsequently\b/gi, "so"],
  [/\bhowever\b/gi, "but"],
  [/\bmodifies\b/gi, "changes"], [/\bmodified\b/gi, "changed"], [/\bmodify\b/gi, "change"],
  [/\bobtains\b/gi, "gets"], [/\bobtained\b/gi, "got"], [/\bobtain\b/gi, "get"],
  [/\brequires\b/gi, "needs"], [/\brequired\b/gi, "needed"], [/\brequire\b/gi, "need"],
  [/\bsufficient\b/gi, "enough"],
];

module.exports = { LEVELS, TOPICS, QUESTIONS, GLOSSARY, PLAIN_WORDS };
