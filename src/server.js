const http = require('http');
const { parse } = require('url');
const { readDatabase, writeDatabase, generateId } = require('./dataStore');

const PORT = process.env.PORT || 3000;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function send(res, statusCode, payload) {
  res.writeHead(statusCode, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed);
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
}

function pathParts(pathname) {
  return pathname.split('/').filter(Boolean);
}

function validateRole(role) {
  const allowed = ['student', 'teacher', 'admin'];
  return allowed.includes(role);
}

function findUser(id, data) {
  return data.users.find((user) => user.id === id);
}

function getCourse(id, data) {
  return data.courses.find((course) => course.id === id);
}

function computeStudentDashboard(studentId, data) {
  const student = findUser(studentId, data);
  if (!student || student.role !== 'student') {
    return null;
  }

  const enrolledCourses = data.courses.filter((course) =>
    course.enrolledStudentIds.includes(studentId)
  );

  const progressRecords = data.progressRecords.filter(
    (record) => record.studentId === studentId
  );

  const courses = enrolledCourses.map((course) => {
    const checkpointsCompleted = progressRecords.filter(
      (record) => record.courseId === course.id && record.status === 'completed'
    );
    const completion = course.checkpoints.length
      ? Math.round((checkpointsCompleted.length / course.checkpoints.length) * 100)
      : 0;
    return {
      id: course.id,
      title: course.title,
      checkpoints: course.checkpoints.length,
      completionPercent: completion,
      liveSessions: data.liveSessions.filter(
        (session) => session.courseId === course.id
      )
    };
  });

  return {
    student,
    courses,
    progressRecords
  };
}

function computeTeacherDashboard(teacherId, data) {
  const teacher = findUser(teacherId, data);
  if (!teacher || teacher.role !== 'teacher') {
    return null;
  }

  const courses = data.courses.filter((course) => course.teacherId === teacherId);
  const liveSessions = data.liveSessions.filter(
    (session) => session.teacherId === teacherId
  );

  const enrollments = courses.map((course) => ({
    courseId: course.id,
    courseTitle: course.title,
    enrolled: course.enrolledStudentIds.length,
    limit: course.enrollmentLimit
  }));

  return {
    teacher,
    courses,
    liveSessions,
    enrollments
  };
}

function computeAdminOverview(data) {
  const totalStudents = data.users.filter((user) => user.role === 'student').length;
  const totalTeachers = data.users.filter((user) => user.role === 'teacher').length;
  const totalCourses = data.courses.length;
  const activeMeetings = data.liveSessions.length;

  return {
    totals: {
      students: totalStudents,
      teachers: totalTeachers,
      courses: totalCourses,
      liveSessions: activeMeetings
    },
    capacity: data.courses.map((course) => ({
      courseId: course.id,
      title: course.title,
      enrolled: course.enrolledStudentIds.length,
      limit: course.enrollmentLimit
    }))
  };
}

function addProgressRecord({ studentId, courseId, checkpointId, isCorrect, data }) {
  const progressRecord = {
    id: generateId('progress'),
    studentId,
    courseId,
    checkpointId,
    status: isCorrect ? 'completed' : 'needs-review',
    score: isCorrect ? 1 : 0,
    submittedAt: new Date().toISOString()
  };
  data.progressRecords.push(progressRecord);
  return progressRecord;
}

function serverHandler(req, res) {
  const { pathname } = parse(req.url, true);
  const parts = pathParts(pathname);

  if (req.method === 'GET' && pathname === '/health') {
    send(res, 200, { status: 'ok' });
    return;
  }

  parseBody(req)
    .catch((error) => {
      send(res, 400, { error: error.message });
    })
    .then((body) => {
      if (res.writableEnded) return;

      const data = readDatabase();

      // User creation
      if (req.method === 'POST' && pathname === '/users') {
        const { name, email, role } = body;
        if (!name || !email || !role) {
          send(res, 400, { error: 'name, email, and role are required' });
          return;
        }
        if (!validateRole(role)) {
          send(res, 400, { error: 'role must be student, teacher, or admin' });
          return;
        }
        const newUser = { id: generateId(role), name, email, role };
        data.users.push(newUser);
        writeDatabase(data);
        send(res, 201, newUser);
        return;
      }

      // Student profile
      if (
        req.method === 'GET' &&
        parts[0] === 'students' &&
        (parts.length === 2 || parts[2] === 'dashboard')
      ) {
        const studentId = parts[1];
        const dashboard = computeStudentDashboard(studentId, data);
        if (!dashboard) {
          send(res, 404, { error: 'Student not found' });
          return;
        }
        send(res, 200, dashboard);
        return;
      }

      // Teacher dashboard
      if (
        req.method === 'GET' &&
        parts[0] === 'teachers' &&
        parts[2] === 'dashboard'
      ) {
        const teacherId = parts[1];
        const dashboard = computeTeacherDashboard(teacherId, data);
        if (!dashboard) {
          send(res, 404, { error: 'Teacher not found' });
          return;
        }
        send(res, 200, dashboard);
        return;
      }

      // Admin overview
      if (req.method === 'GET' && parts[0] === 'admin' && parts[1] === 'overview') {
        const overview = computeAdminOverview(data);
        send(res, 200, overview);
        return;
      }

      // Course listing
      if (req.method === 'GET' && pathname === '/courses') {
        send(res, 200, { courses: data.courses });
        return;
      }

      // Course details
      if (req.method === 'GET' && parts[0] === 'courses' && parts.length === 2) {
        const course = getCourse(parts[1], data);
        if (!course) {
          send(res, 404, { error: 'Course not found' });
          return;
        }
        send(res, 200, course);
        return;
      }

      // Course builder
      if (req.method === 'POST' && pathname === '/courses') {
        const {
          title,
          description,
          duration,
          featuredImage,
          enrollmentLimit = null,
          teacherId,
          assets = [],
          checkpoints = []
        } = body;

        if (!title || !description || !teacherId) {
          send(res, 400, { error: 'title, description, and teacherId are required' });
          return;
        }
        const teacher = findUser(teacherId, data);
        if (!teacher || teacher.role !== 'teacher') {
          send(res, 400, { error: 'teacherId must belong to a teacher' });
          return;
        }

        const course = {
          id: generateId('course'),
          title,
          description,
          duration: duration || 'self-paced',
          featuredImage: featuredImage || null,
          enrollmentLimit: enrollmentLimit ? Number(enrollmentLimit) : null,
          teacherId,
          assets,
          checkpoints: checkpoints.map((checkpoint) => ({
            ...checkpoint,
            id: checkpoint.id || generateId('checkpoint')
          })),
          enrolledStudentIds: []
        };

        data.courses.push(course);
        writeDatabase(data);
        send(res, 201, course);
        return;
      }

      // Add checkpoint
      if (
        req.method === 'POST' &&
        parts[0] === 'courses' &&
        parts[2] === 'checkpoints'
      ) {
        const courseId = parts[1];
        const course = getCourse(courseId, data);
        if (!course) {
          send(res, 404, { error: 'Course not found' });
          return;
        }

        const { title, description, resources = [], quickTest } = body;
        if (!title || !quickTest || !Array.isArray(quickTest.options)) {
          send(res, 400, { error: 'title and quickTest with options are required' });
          return;
        }

        const checkpoint = {
          id: generateId('checkpoint'),
          title,
          description: description || '',
          resources,
          quickTest: {
            question: quickTest.question || 'Quick knowledge check',
            options: quickTest.options,
            correctOptionIndex: Number.isInteger(quickTest.correctOptionIndex)
              ? quickTest.correctOptionIndex
              : 0
          }
        };

        course.checkpoints.push(checkpoint);
        writeDatabase(data);
        send(res, 201, checkpoint);
        return;
      }

      // Enroll student
      if (
        req.method === 'POST' &&
        parts[0] === 'courses' &&
        parts[2] === 'enroll'
      ) {
        const courseId = parts[1];
        const { studentId } = body;
        const course = getCourse(courseId, data);
        if (!course) {
          send(res, 404, { error: 'Course not found' });
          return;
        }
        const student = findUser(studentId, data);
        if (!student || student.role !== 'student') {
          send(res, 400, { error: 'studentId must belong to a student' });
          return;
        }
        if (course.enrolledStudentIds.includes(studentId)) {
          send(res, 200, { message: 'Student already enrolled' });
          return;
        }
        if (
          course.enrollmentLimit &&
          course.enrolledStudentIds.length >= course.enrollmentLimit
        ) {
          send(res, 400, { error: 'Enrollment limit reached' });
          return;
        }

        course.enrolledStudentIds.push(studentId);
        writeDatabase(data);
        send(res, 200, { message: 'Student enrolled', courseId, studentId });
        return;
      }

      // Live session creation
      if (
        req.method === 'POST' &&
        parts[0] === 'courses' &&
        parts[2] === 'live-sessions'
      ) {
        const courseId = parts[1];
        const { teacherId, scheduledAt, title, meetLink } = body;
        const course = getCourse(courseId, data);
        if (!course) {
          send(res, 404, { error: 'Course not found' });
          return;
        }
        if (course.teacherId !== teacherId) {
          send(res, 400, { error: 'teacherId must match the course owner' });
          return;
        }
        const session = {
          id: generateId('session'),
          courseId,
          teacherId,
          scheduledAt: scheduledAt || new Date().toISOString(),
          meetLink: meetLink || 'https://meet.google.com/new',
          title: title || `${course.title} live class`
        };
        data.liveSessions.push(session);
        writeDatabase(data);
        send(res, 201, session);
        return;
      }

      // Quick test submission
      if (
        req.method === 'POST' &&
        parts[0] === 'courses' &&
        parts[2] === 'checkpoints' &&
        parts[4] === 'submit'
      ) {
        const courseId = parts[1];
        const checkpointId = parts[3];
        const { studentId, selectedOptionIndex } = body;

        const course = getCourse(courseId, data);
        if (!course) {
          send(res, 404, { error: 'Course not found' });
          return;
        }
        const checkpoint = course.checkpoints.find((item) => item.id === checkpointId);
        if (!checkpoint) {
          send(res, 404, { error: 'Checkpoint not found' });
          return;
        }
        const student = findUser(studentId, data);
        if (!student || student.role !== 'student') {
          send(res, 400, { error: 'studentId must belong to a student' });
          return;
        }
        if (!Number.isInteger(selectedOptionIndex)) {
          send(res, 400, { error: 'selectedOptionIndex is required' });
          return;
        }

        const isCorrect =
          selectedOptionIndex === checkpoint.quickTest.correctOptionIndex;
        const progressRecord = addProgressRecord({
          studentId,
          courseId,
          checkpointId,
          isCorrect,
          data
        });
        writeDatabase(data);
        send(res, 200, { isCorrect, progressRecord });
        return;
      }

      // Teacher dashboard fallback
      if (req.method === 'GET' && parts[0] === 'teachers' && parts.length === 2) {
        const teacherId = parts[1];
        const dashboard = computeTeacherDashboard(teacherId, data);
        if (!dashboard) {
          send(res, 404, { error: 'Teacher not found' });
          return;
        }
        send(res, 200, dashboard);
        return;
      }

      send(res, 404, { error: 'Route not found' });
    });
}

const server = http.createServer(serverHandler);
server.listen(PORT, () => {
  console.log(`LMS API running on http://localhost:${PORT}`);
});
