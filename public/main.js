/* global io */
const socket = io()

socket.on('connect', function () {
  console.log('Successfully connected to socket.io')
  fetchIssuesAndNotes()
})

document.addEventListener('DOMContentLoaded', function () {
  const newIssueForm = document.getElementById('newIssueForm')
  if (newIssueForm) {
    newIssueForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      const title = document.getElementById('newIssueTitle').value
      await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      })
      document.getElementById('newIssueTitle').value = ''
      window.location.href = 'index.html'
    })
  }

  if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
    fetchIssuesAndNotes()
  }
})

const issuesListElement = document.getElementById('issuesList')
if (issuesListElement) {
  issuesListElement.addEventListener('click', async (event) => {
    if (event.target.classList.contains('addNoteBtn')) {
      const iid = event.target.dataset.iid
      const noteInput = event.target.previousElementSibling
      const noteBody = noteInput.value
      if (noteBody) {
        await fetch(`/api/issues/${iid}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: noteBody })
        })
        noteInput.value = ''
      }
    } else if (event.target.classList.contains('closeIssueBtn')) {
      const iid = event.target.dataset.iid
      const newState = event.target.textContent.trim() === 'Close Issue' ? 'close' : 'reopen'
      await fetch(`/api/issues/${iid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state_event: newState })
      })
    }
  })
}

socket.on('issueUpdated', function (data) {
  updateIssueInList(data)
})

socket.on('noteAdded', function (data) {
  addNoteToIssue(data)
})

socket.on('issueCreated', function (issue) {
  const issuesList = document.getElementById('issuesList')
  // Create or update the issue list item with the new issue data
  const issueElement = createOrUpdateIssueListItem(issue)
  // Prepend the new issue to make it appear at the top of the list
  issuesList.prepend(issueElement)
})

/**
 * Fetches issues and notes from the server and updates the UI with the data.
 */
async function fetchIssuesAndNotes () {
  try {
    const issues = await fetchData('/api/issues')
    const issuesList = document.getElementById('issuesList')
    issuesList.innerHTML = ''

    for (const issue of issues) {
      const notesHtml = createNotesHtml(issue.notes)
      const issueElement = createOrUpdateIssueListItem(issue, notesHtml)
      issuesList.appendChild(issueElement)
    }
  } catch (error) {
    console.error('There has been a problem with your fetch operation:', error)
  }
}

/**
 * Updates the issue in the list with new data.
 * @param {object} data - The data object containing issue information.
 */
function updateIssueInList (data) {
  const issuesList = document.getElementById('issuesList')
  if (issuesList) {
    const existingIssue = Array.from(issuesList.children).find(li => li.dataset.iid === String(data.iid))
    if (existingIssue) {
      // Update issue status by targeting the specific class
      const statusSpan = existingIssue.querySelector('.issue-status')
      if (statusSpan) statusSpan.textContent = data.state

      // Update the Last Edited At text
      const lastEditedSpan = existingIssue.querySelector('.issue-last-edited')
      if (lastEditedSpan) lastEditedSpan.textContent = formatDate(data.updated_at)

      // Update the close/open button text
      const closeButton = existingIssue.querySelector('.closeIssueBtn')
      closeButton.textContent = data.state === 'opened' ? 'Close Issue' : 'Open Issue'
    }
  }
}

/**
 * Adds a new note to the issue.
 * @param {object} data - The data object containing note information.
 */
function addNoteToIssue (data) {
  const issuesList = document.getElementById('issuesList')
  const existingIssue = Array.from(issuesList.children).find(li => li.dataset.iid === String(data.iid))

  if (existingIssue) {
    const lastEditedSpan = existingIssue.querySelector('.issue-last-edited')
    if (lastEditedSpan) {
      lastEditedSpan.textContent = formatDate(data.updated_at)
    }

    const notesDiv = existingIssue.querySelector('.notes')
    // Check if the note already exists by noteId before adding it
    if (!notesDiv.querySelector(`[data-note-id="${data.noteId}"]`)) {
      const newNoteHtml = createNoteHtml(data.noteId, data.note)
      notesDiv.innerHTML += newNoteHtml
    }
  }
}

/**
 * Creates or updates an issue list item with provided issue data and optional notes HTML.
 * @param {object} issue - The issue object.
 * @param {string} notesHtml - HTML string representing the issue's notes.
 * @returns {HTMLElement} The updated or newly created list item element for the issue.
 */
function createOrUpdateIssueListItem (issue, notesHtml = '') {
  const li = document.createElement('li')
  li.dataset.iid = issue.iid
  li.innerHTML = `
      <h2>${issue.title}</h2>
      <p><strong>Created At</strong>: ${formatDate(issue.created_at)}</p>
      <p><strong>Last Edited At</strong>: <span class="issue-last-edited">${formatDate(issue.updated_at)}</span></p>
      <p><strong>Status</strong>: <span class="issue-status">${issue.state}</span></p>
      <div class="notes">${notesHtml}</div>
      <input type="text" class="newNoteInput" placeholder="Add a note...">
      <button class="addNoteBtn" data-iid="${issue.iid}">Add Note</button>
      <button class="closeIssueBtn" data-iid="${issue.iid}">${issue.state === 'opened' ? 'Close' : 'Open'} Issue</button>
  `
  return li
}

/**
 * Creates HTML string for notes.
 * @param {Array} notes - An array of note objects.
 * @returns {string} HTML string representing all notes.
 */
function createNotesHtml (notes) {
  if (!notes || !Array.isArray(notes)) {
    return ''
  }
  return notes.map(note => createNoteHtml(note.id, note.body)).join('')
}

/**
 * Creates an HTML string for a single note.
 * @param {number} noteId - The unique identifier for the note.
 * @param {string} noteBody - The text content of the note.
 * @returns {string} HTML string representation of the note.
 */
function createNoteHtml (noteId, noteBody) {
  return `
    <div class="note" data-note-id="${noteId}">
      <p><strong>Note</strong>: ${noteBody}</p>
    </div>
  `
}

/**
 * Fetches data from a specified URL.
 * @param {string} url - The URL from which to fetch data.
 * @returns {Promise<object>} A promise that resolves to the JSON content.
 */
async function fetchData (url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Network response was not ok for ${url}`)
  }
  return await response.json()
}

/**
 * Formats a date string into a more readable format.
 * @param {string} dateString - The date string to format.
 * @returns {string} The formatted date string.
 */
function formatDate (dateString) {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = ('0' + (date.getMonth() + 1)).slice(-2)
  const day = ('0' + date.getDate()).slice(-2)
  const hours = ('0' + date.getHours()).slice(-2)
  const minutes = ('0' + date.getMinutes()).slice(-2)

  return `${year}-${month}-${day} - ${hours}:${minutes}`
}
