import { JOKE_API_URL, normalizeJokeResponse } from './joke-utils.js';

const fetchButton = document.querySelector('#fetch-joke');
const retryButton = document.querySelector('#retry-joke');
const statusText = document.querySelector('#status');
const setupText = document.querySelector('#joke-setup');
const deliveryText = document.querySelector('#joke-delivery');

function setLoadingState(isLoading) {
  fetchButton.disabled = isLoading;
  retryButton.disabled = isLoading;
  fetchButton.textContent = isLoading ? 'Loading...' : 'Get random joke';
}

function showRetry(show) {
  retryButton.hidden = !show;
}

function renderEmpty(message) {
  statusText.textContent = message;
  setupText.textContent = '';
  deliveryText.textContent = '';
}

function renderJoke(joke) {
  statusText.textContent = 'Here is your joke:';
  setupText.textContent = joke.setup;
  deliveryText.textContent = joke.delivery;
}

function renderError(message) {
  statusText.textContent = message;
  setupText.textContent = '';
  deliveryText.textContent = '';
}

async function loadJoke() {
  setLoadingState(true);
  showRetry(false);
  renderEmpty('Loading a joke...');

  try {
    const response = await fetch(JOKE_API_URL, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status}).`);
    }

    const payload = await response.json();
    const joke = normalizeJokeResponse(payload);

    if (!joke) {
      renderEmpty('No joke was returned. Please try again.');
      showRetry(true);
      return;
    }

    renderJoke(joke);
  } catch (error) {
    renderError('Could not fetch a joke right now. Please try again.');
    showRetry(true);
    console.error(error);
  } finally {
    setLoadingState(false);
  }
}

fetchButton.addEventListener('click', loadJoke);
retryButton.addEventListener('click', loadJoke);
