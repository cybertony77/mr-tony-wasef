import { MongoClient, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../../../lib/authMiddleware';
import { getCookieValue } from '../../../lib/cookies';
import { getSignedImageUrlServer } from '../../../lib/cloudinary';
import {
  getMongoFromEnv,
  MARKETING_DOC_ID,
  defaultMarketingDoc,
} from '../../../lib/marketingPageMongo';
import { resolveGoogleMeetVideoForSave } from '../../../lib/googleServer';
import {
  encodeGoogleMeetSecureId,
} from '../../../lib/googleVideoIds';

function tryDecodeJwt(req, jwtSecret) {
  const token = getCookieValue(req.headers?.cookie, 'token');
  if (!token || !jwtSecret) return null;
  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    return null;
  }
}

async function loadUserRole(db, decoded) {
  if (!decoded?.assistant_id) return null;
  const u = await db.collection('users').findOne(
    { id: decoded.assistant_id },
    { projection: { role: 1 } }
  );
  return u?.role || null;
}

function isPrivilegedRole(role) {
  return role === 'admin' || role === 'developer';
}

async function getOrCreateMarketingDoc(db) {
  let doc = await db.collection('marketing_page').findOne({ _id: MARKETING_DOC_ID });
  if (!doc) {
    const base = defaultMarketingDoc();
    await db.collection('marketing_page').insertOne(base);
    doc = base;
  }
  return doc;
}

function toObjectIds(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const id of arr) {
    try {
      if (typeof id === 'string' && ObjectId.isValid(id)) out.push(new ObjectId(id));
      else if (id instanceof ObjectId) out.push(id);
    } catch {
      /* skip */
    }
  }
  return out;
}

function buildCenterScheduleRows(centers) {
  const rows = [];
  if (!Array.isArray(centers)) return rows;
  centers.forEach((center) => {
    if (!center?.grades?.length) return;
    center.grades.forEach((gradeData) => {
      if (!gradeData?.timings?.length) return;
      gradeData.timings.forEach((timing) => {
        const rawCourse = gradeData.course || gradeData.grade || '';
        const centerName = center.name || '';
        rows.push({
          center: centerName,
          course: rawCourse,
          courseType: gradeData.courseType || '',
          day: timing.day,
          time: `${timing.time} ${timing.period || ''}`.trim(),
          location: center.location || null,
          course_display:
            String(rawCourse).trim().toLowerCase() === 'all' ? 'Basics' : rawCourse || '—',
          location_display:
            String(centerName).trim().toLowerCase() === 'online'
              ? 'Online'
              : (center.location && String(center.location).trim()) || 'No Location',
        });
      });
    });
  });
  return rows;
}

export default async function handler(req, res) {
  const { MONGO_URI, DB_NAME, envConfig } = getMongoFromEnv();
  const JWT_SECRET = envConfig.JWT_SECRET || process.env.JWT_SECRET;
  const systemEnabled =
    envConfig.SYSTEM_MARKETING_PAGE === 'true' || process.env.SYSTEM_MARKETING_PAGE === 'true';

  if (!systemEnabled) {
    return res.status(404).json({ error: 'Not found' });
  }

  let client;
  try {
    client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    if (req.method === 'GET') {
      const decoded = tryDecodeJwt(req, JWT_SECRET);
      const roleFromDb = decoded ? await loadUserRole(db, decoded) : null;
      const canEdit = isPrivilegedRole(roleFromDb);

      const doc = await getOrCreateMarketingDoc(db);
      const pageLive = doc.page_state !== false;

      if (!pageLive && !canEdit) {
        return res.status(404).json({ error: 'Not found' });
      }

      let teacher_picture_url = null;
      if (doc.teacher_picture) {
        teacher_picture_url = await getSignedImageUrlServer(doc.teacher_picture);
      }

      const centerIds = toObjectIds(doc.dates_of_sessions || []);
      let centers =
        centerIds.length > 0
          ? await db
              .collection('centers')
              .find({ _id: { $in: centerIds } })
              .toArray()
          : [];
      const centerOrder = new Map(centerIds.map((id, i) => [id.toString(), i]));
      centers = centers.sort(
        (a, b) => (centerOrder.get(a._id.toString()) ?? 0) - (centerOrder.get(b._id.toString()) ?? 0)
      );

      const assistantIds = toObjectIds(doc.contact_assistants || []);
      let assistants =
        assistantIds.length > 0
          ? await db
              .collection('users')
              .find({ _id: { $in: assistantIds } })
              .project({ id: 1, name: 1, phone: 1, role: 1 })
              .toArray()
          : [];
      const asstOrder = new Map(assistantIds.map((id, i) => [id.toString(), i]));
      assistants = assistants.sort(
        (a, b) => (asstOrder.get(a._id.toString()) ?? 0) - (asstOrder.get(b._id.toString()) ?? 0)
      );

      let session_video_type = doc.session_video_type ?? null;
      let session_video_id = doc.session_video_id ?? null;
      if (!session_video_type && !session_video_id && doc.yt_session_link) {
        const yt = String(doc.yt_session_link).trim();
        const ytMatch = yt.match(
          /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/
        );
        if (ytMatch?.[1]) {
          session_video_type = 'youtube';
          session_video_id = ytMatch[1];
        } else if (yt) {
          session_video_type = 'youtube';
          session_video_id = yt;
        }
      }

      const contact_people = Array.isArray(doc.contact_people)
        ? doc.contact_people
            .map((p, i) => ({
              id: String(p?.id || `person_${i}`),
              name: String(p?.name || '').trim(),
              phone: String(p?.phone || '').trim(),
            }))
            .filter((p) => p.name && p.phone)
        : [];

      const rawShow = doc.testimonials_to_show;
      const testimonials_to_show =
        rawShow === null || rawShow === undefined || rawShow === ''
          ? null
          : Math.max(0, Math.floor(Number(rawShow)) || 0);

      const activatedDocs = await db
        .collection('testimonials')
        .find({ state: 'Activated' })
        .project({ name: 1, course: 1, text: 1, score: 1, rating: 1, id: 1 })
        .toArray();

      const activated_testimonials = activatedDocs
        .map((t) => {
          const ratingNum = Number(t.rating);
          return {
            id: t.id ?? null,
            name: String(t.name || '').trim(),
            course: String(t.course || '').trim(),
            text: String(t.text || '').trim(),
            score:
              t.score === undefined || t.score === null || t.score === ''
                ? null
                : t.score,
            rating:
              Number.isFinite(ratingNum) && ratingNum > 0
                ? Math.min(5, Math.max(1, Math.round(ratingNum)))
                : null,
          };
        })
        .filter((t) => t.name && t.course && t.text);

      const payload = {
        page_state: pageLive,
        teacher_picture: doc.teacher_picture ?? null,
        teacher_picture_url,
        teacher_name: doc.teacher_name ?? null,
        teacher_description: doc.teacher_description ?? null,
        students_teached: doc.students_teached ?? null,
        years_of_experience: doc.years_of_experience ?? null,
        yt_session_link: doc.yt_session_link ?? null,
        session_video_type,
        session_video_id:
          String(session_video_type || '').toLowerCase() === 'google_meet' && session_video_id
            ? encodeGoogleMeetSecureId({
                fileId: session_video_id,
                ownerUserId: doc.session_video_google_owner || '',
              })
            : session_video_id,
        dates_of_session_ids: centerIds.map((id) => id.toString()),
        contact_assistant_ids: assistantIds.map((id) => id.toString()),
        contact_people,
        links: doc.links ?? null,
        students_testimonials: doc.students_testimonials ?? null,
        testimonials_to_show,
        activated_testimonials,
        outro_text: doc.outro_text ?? null,
        note: doc.note ?? null,
        centers: centers.map((c) => ({
          ...c,
          _id: c._id.toString(),
        })),
        schedule_rows: buildCenterScheduleRows(centers),
        assistants: assistants.map((a) => ({
          ...a,
          _id: a._id.toString(),
        })),
        canEdit,
      };

      return res.status(200).json(payload);
    }

    if (req.method === 'PATCH') {
      let user;
      try {
        user = await authMiddleware(req);
      } catch {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const dbUser = await db.collection('users').findOne({ id: user.assistant_id });
      if (!dbUser || !isPrivilegedRole(dbUser.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const updates = {};

      if ('page_state' in body) {
        updates.page_state = Boolean(body.page_state);
      }
      if ('teacher_picture' in body) {
        const v = body.teacher_picture;
        updates.teacher_picture =
          v === null || v === '' || v === undefined ? null : String(v).trim();
      }
      if ('teacher_name' in body) {
        const v = body.teacher_name;
        updates.teacher_name =
          v === null || v === '' || v === undefined ? null : String(v).trim();
      }
      if ('teacher_description' in body) {
        const v = body.teacher_description;
        updates.teacher_description =
          v === null || v === '' || v === undefined
            ? null
            : String(v).slice(0, 600);
      }
      if ('students_teached' in body) {
        const v = body.students_teached;
        if (v === null || v === '' || v === undefined) {
          updates.students_teached = null;
        } else {
          const n = Number(v);
          if (Number.isNaN(n)) {
            return res.status(400).json({ error: 'Invalid students_teached' });
          }
          updates.students_teached = n;
        }
      }
      if ('years_of_experience' in body) {
        const v = body.years_of_experience;
        if (v === null || v === '' || v === undefined) {
          updates.years_of_experience = null;
        } else {
          const n = Number(v);
          if (Number.isNaN(n)) {
            return res.status(400).json({ error: 'Invalid years_of_experience' });
          }
          updates.years_of_experience = n;
        }
      }
      if ('yt_session_link' in body) {
        const v = body.yt_session_link;
        updates.yt_session_link =
          v === null || v === '' || v === undefined ? null : String(v).trim();
      }
      if ('session_video_type' in body || 'session_video_id' in body) {
        const typeRaw =
          'session_video_type' in body ? body.session_video_type : undefined;
        const idRaw = 'session_video_id' in body ? body.session_video_id : undefined;
        const type =
          typeRaw === null || typeRaw === '' || typeRaw === undefined
            ? null
            : String(typeRaw).trim().toLowerCase();
        const id =
          idRaw === null || idRaw === '' || idRaw === undefined
            ? null
            : String(idRaw).trim();

        if (!type || !id) {
          updates.session_video_type = null;
          updates.session_video_id = null;
          updates.session_video_google_owner = null;
          updates.yt_session_link = null;
        } else if (!['youtube', 'r2', 'zoom', 'google_meet'].includes(type)) {
          return res.status(400).json({ error: 'Invalid session_video_type' });
        } else if (type === 'google_meet') {
          const resolved = resolveGoogleMeetVideoForSave(
            id,
            user.assistant_id ?? user.id
          );
          if (!resolved?.fileId) {
            return res.status(400).json({
              error: 'Invalid Google Meet recording. Re-select the recording.',
            });
          }
          updates.session_video_type = 'google_meet';
          updates.session_video_id = resolved.fileId;
          updates.session_video_google_owner = resolved.ownerUserId;
          updates.yt_session_link = null;
        } else {
          updates.session_video_type = type;
          updates.session_video_id = id;
          updates.session_video_google_owner = null;
          updates.yt_session_link =
            type === 'youtube' ? `https://www.youtube.com/watch?v=${id}` : null;
        }
      }
      if ('dates_of_sessions' in body) {
        const ids = toObjectIds(body.dates_of_sessions);
        updates.dates_of_sessions = ids.length ? ids : null;
      }
      if ('contact_assistants' in body) {
        const ids = toObjectIds(body.contact_assistants);
        updates.contact_assistants = ids.length ? ids : null;
      }
      if ('contact_people' in body) {
        if (!body.contact_people || !Array.isArray(body.contact_people)) {
          updates.contact_people = null;
        } else {
          updates.contact_people = body.contact_people
            .map((p, i) => ({
              id: String(p?.id || `person_${Date.now()}_${i}`),
              name: String(p?.name || '').trim(),
              phone: String(p?.phone || '').replace(/[^0-9]/g, ''),
            }))
            .filter((p) => p.name && p.phone);
          if (updates.contact_people.length === 0) updates.contact_people = null;
        }
      }
      if ('links' in body) {
        if (!body.links || !Array.isArray(body.links)) {
          updates.links = null;
        } else {
          updates.links = body.links.map((row) => ({
            name: String(row.name || '').trim(),
            link: String(row.link || '').trim(),
          })).filter((r) => r.name && r.link);
          if (updates.links.length === 0) updates.links = null;
        }
      }
      if ('students_testimonials' in body) {
        if (!body.students_testimonials || !Array.isArray(body.students_testimonials)) {
          updates.students_testimonials = null;
        } else {
          updates.students_testimonials = body.students_testimonials
            .map((t) => ({
              name: String(t.name || '').trim(),
              course: String(t.course || '').trim(),
              text: String(t.text || '').trim(),
              score:
                t.score === undefined || t.score === null || t.score === ''
                  ? null
                  : String(t.score).trim(),
            }))
            .filter((t) => t.name && t.course && t.text);
          if (updates.students_testimonials.length === 0) {
            updates.students_testimonials = null;
          }
        }
      }
      if ('testimonials_to_show' in body) {
        const v = body.testimonials_to_show;
        if (v === null || v === '' || v === undefined) {
          updates.testimonials_to_show = null;
        } else {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0) {
            return res.status(400).json({ error: 'Invalid testimonials_to_show' });
          }
          updates.testimonials_to_show = Math.floor(n);
        }
      }
      if ('outro_text' in body) {
        const v = body.outro_text;
        updates.outro_text =
          v === null || v === '' || v === undefined ? null : String(v);
      }
      if ('note' in body) {
        const v = body.note;
        updates.note = v === null || v === '' || v === undefined ? null : String(v);
      }

      await db.collection('marketing_page').updateOne(
        { _id: MARKETING_DOC_ID },
        { $set: { ...updates, _id: MARKETING_DOC_ID } },
        { upsert: true }
      );

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('marketing_page API:', e);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) await client.close();
  }
}
