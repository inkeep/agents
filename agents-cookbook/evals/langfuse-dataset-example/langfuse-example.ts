import { Langfuse } from "langfuse";
import "dotenv/config";

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: process.env.LANGFUSE_BASE_URL!,
});

// ----- 1. Create the dataset -----
await langfuse.createDataset({
  name: "inkeep-weather-example-dataset",
  description: "My evaluation set for weather tasks",
});

// ----- 2. Add dataset items -----
await langfuse.createDatasetItem({
  datasetName: "inkeep-weather-example-dataset",
  input: { message: "what is the weather in NYC" },
  expectedOutput: {
    result:
      "I'll help you get the weather forecast for New York City. Let me first get the coordinates for NYC, and then I'll fetch the weather forecast for you. Now let me get the weather forecast for those coordinates:Here's the weather forecast for New York City: Current/Afternoon (Today, Sept 18):Right now: 74.5°F with clear conditions This afternoon will warm up to around 82-83°F by early evening Peak temperature expected around 8-9 PM at 82.9°F Tonight: Temperatures will gradually cool down to the low 70s after midnight Clear skies expected through most of the night Tomorrow (Sept 19): Early morning will be the coolest, dropping to around 61°F Mostly clear conditions throughout the day Afternoon temperatures climbing back to the upper 70s Overall: NYC is experiencing beautiful late summer/early fall weather with clear skies and comfortable temperatures. Perfect weather for being outdoors! The temperature swing from the low 60s in the early morning to low 80s in the afternoon is typical for this time of year. Is there anything specific about the weather you'd like to know, such as a particular time or activity you're planning?",
  },
});

await langfuse.createDatasetItem({
  datasetName: "inkeep-weather-example-dataset",
  input: { message: "hi!" },
  expectedOutput: {
    result:
      "Hello! How can I help you today? I have access to tools that can help with weather forecasts.",
  },
});

await langfuse.createDatasetItem({
  datasetName: "inkeep-weather-example-dataset",
  input: { message: "hi what is the time in China right now" },
  expectedOutput: {
    result:
      "I'd be happy to help you find out the current time in China! However, I'm specifically equipped to help with weather forecasts rather than current time information. For the current time in China, you would need to check a world clock or time zone converter. China operates on a single time zone (China Standard Time, CST) which is UTC+8, despite the country's large geographical size.Is there anything weather-related I can help you with instead? For example, I could get you the weather forecast for any city in China like Beijing, Shanghai, or any other location you're interested in!",
  },
});