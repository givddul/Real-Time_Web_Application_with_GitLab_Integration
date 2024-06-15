import 'dotenv/config'
import express from 'express'
import axios from 'axios'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'

const app = express()
const httpServer = createServer(app)
const io = new SocketIOServer(httpServer)

app.use(express.json())
app.use(express.static('public'))

const PORT = process.env.PORT || 3000
const GITLAB_API_TOKEN = process.env.GITLAB_API_TOKEN
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET
const PROJECT_ID = process.env.PROJECT_ID

io.on('connection', (socket) => {
  console.log('Client connected')
  socket.on('disconnect', () => {
    console.log('Client disconnected')
  })
})

app.get('/js/socket.io.js', (req, res) => {
  res.sendFile('node_modules/socket.io/client-dist/socket.io.js', { root: '.' })
})

// (Client) <--- ((Server)) <--- (GitLab) *triggered by a webhook from GitLab*

// Listens for incoming webhook events from GitLab
// When one is recieved, we forward it to the client using the socket.io instance
app.post('/webhook', (req, res) => {
  if (req.headers['x-gitlab-token'] !== WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden')
  }
  console.log('\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n')
  console.log('####################################\n\nReceived a webhook from GitLab:\n\n')
  console.log(req.body)
  console.log('\n\n\n')
  console.log('req.body.object_kind', req.body.object_kind)
  console.log('req.body.object_attributes.note', req.body.object_attributes.note)

  console.log('####################################')

  // Check if it's a new issue creation. action === 'open'will only be true when a new issue is created
  if (req.body.object_attributes.action === 'open') {
    const issueAttributes = req.body.object_attributes
    // Emit event for new issue creation
    io.emit('issueCreated', {
      iid: issueAttributes.iid,
      title: issueAttributes.title,
      created_at: issueAttributes.created_at,
      updated_at: issueAttributes.updated_at,
      state: issueAttributes.state
    })
  } else if (req.body.object_kind === 'issue') { // Issue reopened or closed
    const issueAttributes = req.body.object_attributes
    io.emit('issueUpdated', {
      iid: issueAttributes.iid,
      title: issueAttributes.title,
      created_at: issueAttributes.created_at,
      description: issueAttributes.description,
      updated_at: issueAttributes.updated_at,
      state: issueAttributes.state
    })
  } else if (req.body.object_kind === 'note') {
    // The case when a comment is added to an issue
    const issue = req.body.issue
    const noteAttributes = req.body.object_attributes
    io.emit('noteAdded', {
      iid: issue.iid,
      note: noteAttributes.note,
      created_at: noteAttributes.created_at,
      updated_at: issue.updated_at
    })
  }
  res.status(200).send('OK')
})

// *creats new issue or note* (Client) ---> ((Server)) ---> (GitLab)

// Opon requests from the client, we post new issues or notes to GitLab API

app.post('/api/issues', async (req, res) => {
  const { title, description } = req.body
  const { success, error } = await postToGitLab(`https://gitlab.lnu.se/api/v4/projects/${PROJECT_ID}/issues`, { title, description })

  if (success) {
    res.sendStatus(201)
  } else {
    console.error(error)
    res.sendStatus(500)
  }
})

app.post('/api/issues/:iid/notes', async (req, res) => {
  const { iid } = req.params
  const { body } = req.body
  const { success, data, error } = await postToGitLab(`https://gitlab.lnu.se/api/v4/projects/${PROJECT_ID}/issues/${iid}/notes`, { body })

  if (success) {
    res.json({ message: 'Note added successfully', note: data })
  } else {
    console.error(error)
    res.sendStatus(500)
  }
})

// *open/close issue* (Client) ---> ((Server)) ---> (GitLab)

// Client has closed/reopened an issue. PUT
app.put('/api/issues/:iid', async (req, res) => {
  const { iid } = req.params
  // eslint-disable-next-line camelcase
  const { state_event } = req.body
  try {
    await axios.put(`https://gitlab.lnu.se/api/v4/projects/${PROJECT_ID}/issues/${iid}`, {
      // eslint-disable-next-line camelcase
      state_event
    }, {
      headers: { Authorization: `Bearer ${GITLAB_API_TOKEN}` }
    })
    res.sendStatus(200)
  } catch (error) {
    console.error(error)
    res.sendStatus(500)
  }
})

// *fetches issues/notes* (Client) <--- ((Server)) <--- (GitLab) *fetching issues and notes*

// Opon requests from the client, we request issues and notes from Gitlab API

app.get('/api/issues', async (req, res) => {
  const issues = await fetchGitLabIssuesWithNotes()
  res.json(issues)
})

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}. Link: https://cscloud7-226.lnu.se/`)
})

const postToGitLab = async (url, data) => {
  try {
    const response = await axios.post(url, data, {
      headers: { Authorization: `Bearer ${GITLAB_API_TOKEN}` }
    })
    return { success: true, data: response.data }
  } catch (error) {
    console.error(error)
    return { success: false, error }
  }
}

const fetchGitLabIssuesWithNotes = async () => {
  try {
    const issuesResponse = await axios.get(`https://gitlab.lnu.se/api/v4/projects/${PROJECT_ID}/issues`, {
      headers: { Authorization: `Bearer ${GITLAB_API_TOKEN}` }
    })

    const issuesWithNotesPromises = issuesResponse.data.map(async (issue) => {
      const notesResponse = await axios.get(`https://gitlab.lnu.se/api/v4/projects/${PROJECT_ID}/issues/${issue.iid}/notes`, {
        headers: { Authorization: `Bearer ${GITLAB_API_TOKEN}` }
      })
      return { ...issue, notes: notesResponse.data }
    })

    return Promise.all(issuesWithNotesPromises)
  } catch (error) {
    console.error(error)
    return []
  }
}
