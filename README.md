# Random Joke Generator

Simple web app that fetches random jokes from [JokeAPI](https://v2.jokeapi.dev/joke/Any?safe-mode).

## Features

- Fetches random safe jokes from an external public API (no API key required)
- Handles single-part and two-part (setup/delivery) joke formats
- Includes clear loading, empty, and error states
- Provides a retry action when requests fail or come back empty
- Accessible structure with semantic HTML, keyboard-friendly buttons, and status announcements

## Run locally

1. Ensure you have **Node.js 18+** and **Python 3** installed.
2. Run tests:

   ```bash
   npm test
   ```

3. Start a local server:

   ```bash
   npm start
   ```

4. Open `http://localhost:5173` in your browser.

## API details and limitations

- API used: `https://v2.jokeapi.dev/joke/Any?safe-mode`
- The app depends on external network/API availability.
- Joke availability/content can vary by API response.
- In case of temporary failures, use the **Try again** button.
