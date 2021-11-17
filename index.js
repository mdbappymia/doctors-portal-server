const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient } = require("mongodb");
const admin = require("firebase-admin");
const ObjectId = require("mongodb").ObjectId;
const fileUpload = require("express-fileupload");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const app = express();
const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// firebase initialization
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iuevi.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri);

console.log(uri, process.env.STRIPE_SECRET);
// firebase middlewire function

const verifyToken = async (req, res, next) => {
  if (req.headers?.authorization?.startsWith("Bearer ")) {
    const token = req.headers.authorization.split(" ")[1];
    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    } catch {}
  }
  next();
};
const run = async () => {
  try {
    await client.connect();
    const database = client.db("doctors_portal");
    const appointmentsCollection = database.collection("appointments");
    const userCollection = database.collection("user");
    const doctorCollection = database.collection("doctors");
    console.log("connected");
    // post appointments data to server
    app.post("/appointments", async (req, res) => {
      const appointment = req.body;
      const result = await appointmentsCollection.insertOne(appointment);

      res.json(result);
    });
    // get all appointments
    app.get("/appointments", verifyToken, async (req, res) => {
      const email = req.query.email;
      const date = new Date(req.query.date).toLocaleDateString();

      const query = { email: email, date: date };
      const result = await appointmentsCollection.find(query).toArray();
      res.json(result);
    });

    // get a single appointments using id
    app.get("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await appointmentsCollection.findOne(query);
      res.json(result);
    });

    // update an appointment
    app.put("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const query = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          payment: payment,
        },
      };
      const result = await appointmentsCollection.updateOne(query, updateDoc);
    });

    // get a user
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      let isAdmin = false;
      const user = await userCollection.findOne(query);
      if (user?.role === "admin") {
        isAdmin = true;
      }
      res.json({ admin: isAdmin });
    });
    // post an user
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.json(result);
    });

    // update for google login
    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateUser = { $set: user };
      const result = await userCollection.updateOne(
        filter,
        updateUser,
        options
      );
      res.json(result);
    });

    // put admin email
    app.put("/users/admin", verifyToken, async (req, res) => {
      const user = req.body;
      const requester = req.decodedEmail;

      if (requester) {
        const requesterAccount = await userCollection.findOne({
          email: requester,
        });
        if (requesterAccount.role === "admin") {
          const filter = { email: user.email };
          const updateDoc = {
            $set: { role: "admin" },
          };
          const result = await userCollection.updateOne(filter, updateDoc);
          res.json(result);
        }
      } else {
        res
          .status(403)
          .json({ message: "You do not have permission to make admin" });
      }
    });

    // post a payment information
    app.post("/create-payment-intent", async (req, res) => {
      const paymentInfo = req.body;
      console.log(paymentInfo);
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    });

    // post a doctor information
    app.post("/doctors", async (req, res) => {
      const name = req.body.name;
      const email = req.body.email;
      const pic = req.files.image;
      const picData = pic.data;
      const encodedPic = picData.toString("base64");
      const imageBuffer = Buffer.from(encodedPic, "base64");
      const doctor = {
        name,
        email,
        image: imageBuffer,
      };
      const result = await doctorCollection.insertOne(doctor);
      res.json(result);
    });
    // get all doctors
    app.get("/doctors", async (req, res) => {
      const result = await doctorCollection.find({}).toArray();
      res.json(result);
    });
  } finally {
    //   await client.close()
  }
};
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Doctors portal is running");
});
app.listen(port, () => {
  console.log("Server is running on port", port);
});
