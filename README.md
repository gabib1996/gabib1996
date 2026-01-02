# Lightweight LMS API

This repository contains a minimal learning management system API built with Node.js core modules (no external dependencies). It satisfies the requested features for students, teachers, and admins while providing Google Meet live class links, course checkpoints, and quick tests.

## Getting started

```bash
npm install # No external packages are required; this keeps npm metadata consistent
npm start    # Starts the HTTP server on port 3000
npm test     # Syntax check for the server entry point
```

The API reads and writes data from `data/db.json`. A starter dataset is included with one admin, one teacher, one student, and a demo course.

## Key capabilities

- **Student profile & dashboard**: Enroll students, view their progress per checkpoint, and see live session schedules.
- **Teacher profile & dashboard**: Track courses, enrollment counts, and upcoming live classes.
- **Admin overview**: Aggregate counts of users, courses, and live sessions.
- **Google Meet live classes**: Create live sessions with auto-generated `https://meet.google.com/new` links or provide your own meeting URL.
- **Courses with checkpoints & quick tests**: Each checkpoint includes a quick multiple-choice test to record completion.
- **Course builder**: Create courses with duration, featured image, enrollment limits, and asset metadata (files, images, or supporting links).

## API endpoints

Base URL: `http://localhost:3000`

### Health
- `GET /health` – Service check.

### Users
- `POST /users` – Create a user. Body: `{ "name": string, "email": string, "role": "student" | "teacher" | "admin" }`

### Students
- `GET /students/:id` – Student profile plus course dashboard summary.
- `POST /courses/:courseId/enroll` – Enroll a student into a course. Body: `{ "studentId": string }`
- `POST /courses/:courseId/checkpoints/:checkpointId/submit` – Submit a quick test answer. Body: `{ "studentId": string, "selectedOptionIndex": number }`

### Teachers
- `GET /teachers/:id` – Teacher dashboard (courses, enrollments, live sessions).
- `POST /courses/:courseId/live-sessions` – Schedule a live session with Google Meet support. Body: `{ "teacherId": string, "scheduledAt"?: ISO string, "title"?: string, "meetLink"?: string }`

### Admin
- `GET /admin/overview` – Aggregated counts and capacity information.

### Courses
- `GET /courses` – List courses.
- `GET /courses/:id` – Course details.
- `POST /courses` – Course builder. Body includes: `title`, `description`, `duration?`, `featuredImage?`, `enrollmentLimit?`, `teacherId`, optional `assets` array, and optional `checkpoints` array (each checkpoint should include `title`, `description?`, `resources?`, and `quickTest`).
- `POST /courses/:courseId/checkpoints` – Add a checkpoint with quick test. Body: `{ "title": string, "description"?: string, "resources"?: string[], "quickTest": { "question"?: string, "options": string[], "correctOptionIndex"?: number } }`

## Data model highlights

- **Users**: `{ id, name, email, role }`
- **Courses**: `{ id, title, description, duration, featuredImage, enrollmentLimit, teacherId, assets, checkpoints, enrolledStudentIds }`
- **Checkpoints**: `{ id, title, description, resources, quickTest: { question, options, correctOptionIndex } }`
- **Live sessions**: `{ id, courseId, teacherId, scheduledAt, meetLink, title }`
- **Progress records**: quick-test submissions with status and score.

## Sample workflow

1. Create a teacher and a course using `POST /users` and `POST /courses`.
2. Add checkpoints with `POST /courses/:courseId/checkpoints`.
3. Enroll students via `POST /courses/:courseId/enroll`.
4. Schedule live sessions with `POST /courses/:courseId/live-sessions` (omit `meetLink` to auto-generate a Google Meet URL).
5. Students submit checkpoint quick tests through `POST /courses/:courseId/checkpoints/:checkpointId/submit` and view their dashboard with `GET /students/:id`.

## Notes

- The implementation uses only Node.js core modules to avoid dependency installation issues.
- Data is stored in JSON for simplicity; update `data/db.json` or the API to persist changes.
