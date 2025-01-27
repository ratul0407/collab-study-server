require("dotenv").config();
const cors = require("cors");
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 9000;

const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  optionSuccessStatus: 200,
};

//middlewares
app.use(cors(corsOptions));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@ratul.gtek0.mongodb.net/?retryWrites=true&w=majority&appName=Ratul`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "Forbidden Access!" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Forbidden Access!" });
    }
    req.user = decoded;
    next();
  });
};
async function run() {
  try {
    const database = client.db("studyHouse");
    const usersCollection = database.collection("users");
    const sessionsCollection = database.collection("sessions");
    const notesCollection = database.collection("notes");
    const rejectSessionsCollection = database.collection("rejections");
    const bookedSessionCollection = database.collection("bookedSession");
    const reviewsCollection = database.collection("reviews");
    const materialsCollection = database.collection("materials");
    //verify tutor
    const verifyTutor = async (req, res, next) => {
      const email = req.user?.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "tutor")
        return res.status(403).send("Forbidden Access! Tutor only actions!");
      next();
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.user?.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "admin")
        return res.status(403).send("Forbidden Access! Admin only actions!");
      next();
    };
    //get all users
    app.get("/users/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const page = parseInt(req.query.page);
      const limit = parseInt(req.query.limit);
      const search = req.query.search;

      const query = {
        $and: [
          {
            email: { $ne: email }, // Exclude the specified email
          },
          {
            $or: [
              {
                email: {
                  $regex: search,
                  $options: "i", // Case-insensitive search in email
                },
              },
              {
                name: {
                  $regex: search,
                  $options: "i", // Case-insensitive search in name
                },
              },
            ],
          },
        ],
      };

      const result = await usersCollection
        .find(query)
        .skip(page * limit)
        .limit(limit)
        .toArray();
      res.send(result);
    });

    //get users count
    app.get("/usersCount", verifyToken, verifyAdmin, async (req, res) => {
      const count = await usersCollection.estimatedDocumentCount();
      res.send({ count });
    });
    //add user to the database
    app.post("/users/:email", async (req, res) => {
      const email = req.params.email;

      const query = { email };
      const user = req.body;

      const isExist = await usersCollection.findOne(query);
      if (isExist) return res.send(isExist);
      const result = await usersCollection.insertOne({ ...user });
      res.send(result);
    });

    //get access to users role
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
      res.send({ role: result?.role });
    });
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    //update users role
    app.post("/users/role/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      console.log(role);
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: role,
        },
      };
      const result = await usersCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    // add a new study session

    app.post("/add-session", verifyToken, verifyTutor, async (req, res) => {
      const session = req.body;
      const result = await sessionsCollection.insertOne(session);
      res.send(result);
    });

    //get study sessions based on an email
    app.get("/study-session/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { tutor_email: email };
      const result = await sessionsCollection.find(query).toArray();
      res.send(result);
    });

    //get all sessions
    app.get("/sessions", verifyToken, verifyAdmin, async (req, res) => {
      const groupedSessions = await sessionsCollection
        .aggregate([
          {
            $group: {
              _id: "$status",
              sessions: { $push: "$$ROOT" },
            },
          },
          {
            $project: {
              _id: 0,
              status: "$_id",
              sessions: 1,
            },
          },
        ])
        .toArray();
      const result = {};
      groupedSessions.forEach((group) => {
        result[group.status] = group.sessions;
      });
      res.send(result);
    });

    //get 6 sessions for home page
    app.get("/sessions-home", async (req, res) => {
      const query = { status: "Approved" };
      const result = await sessionsCollection.find(query).limit(6).toArray();
      res.send(result);
    });
    //update sessions status and price
    app.patch("/session/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const status = req.body.status;
      const fee = req.body.fee;
      const updatedDoc = {
        $set: {
          status: status,
          fee: fee,
        },
      };

      const result = await sessionsCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    //get a single study session
    app.get("/session/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await sessionsCollection.findOne(query);
      res.send(result);
    });

    // reject a session
    app.post(
      "/reject-session/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const status = req.body.status;
        const reason = req.body.reason;
        const feedback = req.body.feedback;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: status,
          },
        };

        const session = await sessionsCollection.updateOne(query, updatedDoc);
        const result = await rejectSessionsCollection.insertOne({
          sessionId: id,
          feedback,
          reason,
        });
        res.send(result);
      }
    );

    //get all  tutors

    app.get("/tutors", async (req, res) => {
      const query = { role: "tutor" };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });
    //add a new note to the database
    app.post("/notes", verifyToken, async (req, res) => {
      const note = req.body;
      const result = await notesCollection.insertOne(note);
      res.send(result);
    });

    //get all the notes for a specific user
    app.get("/notes/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await notesCollection.find(query).toArray();
      res.send(result);
    });

    //update a specific note
    app.patch("notes/:id", verifyToken, async (req, res) => {
      const { note } = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          title: note.title,
          description: note.description,
        },
      };
      console.log(note);
      const result = await notesCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    // delete a note
    app.delete("/notes/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await notesCollection.deleteOne(query);
      res.send(result);
    });

    //book a session
    app.post("/booked-session", verifyToken, async (req, res) => {
      const session = req.body;
      const student = req.body.student;
      const alreadyBooked = await bookedSessionCollection.findOne({ student });
      if (alreadyBooked)
        return res
          .status(409)
          .send({ message: "You have already booked this session" });

      const result = await bookedSessionCollection.insertOne(session);
      res.send(result);
    });

    //get booked sessions based on email
    app.get("/booked-session/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      const result = await bookedSessionCollection
        .aggregate([
          {
            $match: { student: email },
          },
          {
            $addFields: {
              sessionIdObject: { $toObjectId: "$sessionId" },
            },
          },
          {
            $lookup: {
              from: "sessions",
              localField: "sessionIdObject",
              foreignField: "_id",
              as: "sessionData",
            },
          },
          {
            $unwind: "$sessionData",
          },
          {
            $addFields: {
              img: "$sessionData.img",
              title: "$sessionData.title",
              tutor: "$sessionData.tutor_email",
              class_start: "$sessionData.class_start",
              class_end: "$sessionData.class_end",
              fee: "$sessionData.fee",
              description: "$sessionData.description",
              rating: "$sessionData.rating",
            },
          },
          {
            $project: {
              sessionData: 0,
              sessionIdObject: 0,
            },
          },
        ])
        .toArray();

      res.send(result);
    });

    //add a new review

    app.post("/reviews", verifyToken, async (req, res) => {
      const review = req.body;
      const { rating, session } = req.body;
      console.log(rating, session);
      await sessionsCollection.updateOne(
        {
          _id: new ObjectId(session),
        },
        { $inc: { rating: 1 } }
      );

      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    //add a new material
    app.post("/materials", verifyToken, verifyTutor, async (req, res) => {
      const material = req.body;

      const result = await materialsCollection.insertOne(material);
      res.send(result);
    });
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to study house let's prepare......");
});

app.listen(port, () => {
  console.log(`Server running at ${port}`);
});
