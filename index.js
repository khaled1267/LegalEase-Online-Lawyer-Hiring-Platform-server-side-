


const express = require("express");



const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

// Create a MongoClient yui
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS= createRemoteJWKSet(new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log(authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  // ["Bearer", "xjasasdhsagdydsav"]

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ msg: "Unauthorized" });
  }
  console.log(token);

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    console.log(payload);

    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({ msg: "Unauthorized" });
  }
};


async function run() {
  try {
    // Connect the client to the server
    await client.connect(); // মঙ্গোডিবি কানেকশন নিশ্চিত করার জন্য আনকমেন্ট করা হলো

    // সফলভাবে কানেক্ট হলে এই মেসেজটি দেখাবে
    console.log("Successfully connected to MongoDB!");

    // Collections
    const db = client.db("legalease");
    const usersCollection = db.collection("user");
    const lawyersCollection = client.db("legalease").collection("services");
    const hiringsCollection = db.collection("hirings");
    const paymentsCollection = db.collection("payments"); // অথবা "hirings" আপনার কালেকশনের নাম অনুযায়ী    const bookingcollection =db.collection("bookings");
    const commentsCollection = db.collection("comments");
    const servicesCollection = db.collection("services");

    // ==========================================
    // ⚖️ SERVICE MANAGEMENT API
    // ==========================================

    // ➕ [CREATE] নতুন সার্ভিস যোগ করার API
    app.post("/services", async (req, res) => {
      try {
        const newService = req.body;
        const newLawyer = {
          ...newService,
          createdAt: new Date(),
        };
        const result = await servicesCollection.insertOne(newLawyer);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to add service", error });
      }
    });

    // 📋 [READ] নির্দিষ্ট লয়ারের ইমেইল অনুযায়ী সব সার্ভিস গেট করার API
    app.get("/services", async (req, res) => {
      try {
        const email = req.query.email;
        let query = {};

        if (email) {
          query = { lawyerEmail: email };
        }

        const result = await servicesCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch services", error });
      }
    });

    // 🔍 [READ SINGLE] নির্দিষ্ট ১টি সার্ভিসের ID অনুযায়ী সম্পূর্ণ ডিটেইলস গেট করার API
    app.get("/services/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await servicesCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Lawyer service not found" });
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to fetch lawyer details",
          error: error.message,
        });
      }
    });

    // 📝 [UPDATE] নির্দিষ্ট সার্ভিস এডিট/আপডেট করার API
    app.put("/services/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedService = req.body;

        const updateDoc = {
          $set: {
            name: updatedService.name,
            specialization: updatedService.specialization,
            fee: updatedService.fee,
            bio: updatedService.bio,
            image: updatedService.image,
          },
        };

        const result = await servicesCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update service", error });
      }
    });

    // ❌ [DELETE] নির্দিষ্ট সার্ভিস ডিলিট করার API
    app.delete("/services/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const result = await servicesCollection.deleteOne(filter);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to delete service", error });
      }
    });

    // 👤 [UPDATE] ইউজারের প্রোফাইল আপডেট করার API
    app.put("/users/update-profile", async (req, res) => {
      try {
        const email = req.query.email;
        const { fullName, profilePicture } = req.body;

        if (!email) {
          return res.status(400).send({
            success: false,
            message: "Email query parameter is required",
          });
        }

        const filter = { email: email };
        const updateDoc = { $set: {} };

        if (fullName) updateDoc.$set.fullName = fullName;
        if (profilePicture) updateDoc.$set.image = profilePicture;

        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }

        res.send({
          success: true,
          message: "Profile updated successfully!",
          result,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to update profile",
          error: error.message,
        });
      }
    });

    // ==========================================
    // 👤 LAWYER PROFILE MANAGEMENT API
    // ==========================================

    app.put("/lawyers", async (req, res) => {
      try {
        const email = req.query.email;
        const lawyerData = req.body;

        if (!email) {
          return res
            .status(400)
            .send({ success: false, message: "Lawyer email is required" });
        }

        const filter = { email: email };
        const updateDoc = {
          $set: {
            name: lawyerData.name,
            specialization: lawyerData.specialization,
            fee: parseInt(lawyerData.fee),
            bio: lawyerData.bio,
            image: lawyerData.image,
            email: email,
            updatedAt: new Date(),
          },
        };

        const result = await lawyersCollection.updateOne(filter, updateDoc, {
          upsert: true,
        });
        res.send({
          success: true,
          message: "Lawyer profile saved successfully!",
          result,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to save lawyer profile",
          error,
        });
      }
    });

    // ==========================================
    // 👤 LAWYER PROFILE MANAGEMENT API
    // ==========================================

    // ১. 📥 POST API: নতুন লয়ার ডাটাবেজে ইনসার্ট করার জন্য
    app.post("/lawyers", async (req, res) => {
      try {
        const lawyerData = req.body;

        // ইমেইল ঠিকঠাক পাঠানো হয়েছে কিনা চেক
        if (!lawyerData.email) {
          return res
            .status(400)
            .send({ success: false, message: "Lawyer email is required" });
        }

        // ডাটাবেজে সেভ করার জন্য অবজেক্ট তৈরি
        const newLawyer = {
          name: lawyerData.name,
          specialization: lawyerData.specialization,
          fee: parseInt(lawyerData.fee) || 0, // স্ট্রিং আসলে নাম্বারে কনভার্ট হবে
          bio: lawyerData.bio,
          image: lawyerData.image,
          email: lawyerData.email,
          createdAt: new Date(),
        };

        // সরাসরি ডাটাবেজে নতুন ডকুমেন্ট ইনসার্ট করা
        const result = await lawyersCollection.insertOne(newLawyer);
        res.status(201).send({
          success: true,
          message: "Lawyer profile created successfully!",
          result,
        });
      } catch (error) {
        console.error("POST Error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to insert lawyer profile",
          error: error.message,
        });
      }
    });

app.get('/lawyers', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search || "";
    
    // 🌟 এখানে ৩ দেওয়া হয়েছে যাতে ৮ জন লইয়ার ৩টি ভিন্ন পেজে ভাগ হয়ে যায়
    const limit = 8; 
    const skip = (page - 1) * limit;

    let query = {};

    // সার্চ লজিক
    if (search.trim() !== "") {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { specialization: { $regex: search, $options: "i" } }
      ];
    }

    // ডাটা কাউন্ট ও ফেচ
    const total = await lawyersCollection.countDocuments(query);
    const result = await lawyersCollection.find(query).skip(skip).limit(limit).toArray();

    res.send({ 
      success: true, 
      lawyers: result, 
      total: total 
    });

  } catch (error) {
    console.error("Backend error on /lawyers:", error);
    res.status(500).send({ success: false, lawyers: [], total: 0 });
  }
});
    // ==========================================
    // 🤝 LAWYER HIRING & REQUESTS MANAGEMENT API (ফাংশন স্কোপের ভেতরে আনা হয়েছে)
    // ==========================================

    // ১. [CREATE] ক্লায়েন্ট যখন কোনো লইয়ারকে হায়ার করার রিকোয়েস্ট পাঠাবে
    app.post("/hirings",verifyToken, async (req, res) => {
      try {
        const hiringRequest = req.body;
        const result = await hiringsCollection.insertOne(hiringRequest);
        res.status(201).send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to send hiring request", error });
      }
    });

    // ২. [READ] নির্দিষ্ট লইয়ারের ইমেইল অনুযায়ী তার কাছে আসা সব রিকোয়েস্ট গেট করার API
    // ২. লইয়ারের কাছে আসা সব রিকোয়েস্ট গেট করার API (টেস্টিং ফ্রেন্ডলি)
    app.get("/hirings/lawyer", async (req, res) => {
      try {
        const email = req.query.email;
        const all = req.query.all;

        let query = {};

        // যদি নির্দিষ্ট ইমেইল থাকে তবে সেটা দিয়ে খুঁজবে, না থাকলে সব ডেটা দেবে
        if (email && !all) {
          query = { lawyerEmail: email };
        }

        const result = await hiringsCollection
          .find(query)
          .sort({ _id: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to fetch hiring requests", error });
      }
    });

    // ক্লায়েন্ট ইমেইল অনুযায়ী তার পাঠানো সব রিকোয়েস্ট গেট করার API
    app.get("/hirings", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res
            .status(400)
            .send({ message: "Email query parameter is required" });
        }

        // কুয়েরি অবজেক্টে clientEmail ফিল্ড সেট করা হলো
        const query = { clientEmail: email };
        const result = await hiringsCollection
          .find(query)
          .sort({ _id: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to fetch user history", error });
      }
    });

    // ৩. [UPDATE] লইয়ার রিকোয়েস্ট Accept বা Reject করলে স্ট্যাটাস আপডেট করার API
    app.patch("/hirings/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Request ID format" });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { status: status },
        };

        const result = await hiringsCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update status", error });
      }
    });

    // ১. নির্দিষ্ট ইউজারের সব কমেন্ট গেট (GET) করা
    // ==========================================
    // 💬 COMMENTS MANAGEMENT API
    // ==========================================

    // ➕ [নতুন সংযোজন ১] কমেন্ট পোস্ট করার মেইন API (POST)
    app.post("/comments", async (req, res) => {
      try {
        const commentData = req.body;
        const result = await commentsCollection.insertOne(commentData);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to post comment", error });
      }
    });

    // 📋 [নতুন সংযোজন ২] নির্দিষ্ট লইয়ারের ID অনুযায়ী সব কমেন্ট গেট করার API (GET)
    app.get("/comments", async (req, res) => {
      try {
        const lawyerId = req.query.lawyerId;
        let query = {};
        if (lawyerId) {
          query = { lawyerId: lawyerId };
        }
        const result = await commentsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch comments", error });
      }
    });

    // ৩. নির্দিষ্ট ইউজারের সব কমেন্ট গেট (GET) করা (আপনার অলরেডি আছে)
    app.get("/comments/user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await commentsCollection.find(query).toArray();
      res.send(result);
    });

    // ৪. কমেন্ট আপডেট (PATCH/PUT) করা (আপনার অলরেডি আছে)
    app.patch("/comments/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedComment = req.body;
      const updateDoc = {
        $set: {
          commentText: updatedComment.commentText,
          date: updatedComment.date,
        },
      };
      const result = await commentsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // ৫. কমেন্ট ডিলিট (DELETE) করা (আপনার অলরেডি আছে)
    app.delete("/comments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await commentsCollection.deleteOne(query);
      res.send(result);
    });

    // ==========================================
    // 👑 ADMIN MANAGEMENT API
    // ==========================================

    // ১. সব ইউজার গেট করা (Manage Users-এর জন্য)
    app.get("/users", async (req, res) => {
      try {
        const result = await usersCollection.find({}).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch users" });
      }
    });

    // ২. ইউজারের রোল পরিবর্তন করা (Make Admin/Lawyer/User)
    app.patch("/users/role/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { role: role } };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update role" });
      }
    });

    // ৩. ইউজার ডিলিট করা
    app.delete("/users/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const result = await usersCollection.deleteOne(filter);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to delete user" });
      }
    });

    // ৪. সব ট্রানজেকশন গেট করা
    app.get("/all-transactions", async (req, res) => {
      try {
        const result = await paymentsCollection
          .find({})
          .sort({ _id: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch transactions" });
      }
    });

    // ৫. অ্যানালিটিক্স ডাটা কাউন্ট করা (Dashboard Analytics)
    app.get("/admin-analytics", async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments({
          role: "user",
        });
        const totalLawyers = await usersCollection.countDocuments({
          role: "lawyer",
        }); // অথবা lawyersCollection
        const totalHires = await hiringsCollection.countDocuments({});

        // টোটাল রেভিনিউ হিসাব করা (paymentsCollection থেকে amount সাম করা)
        const payments = await paymentsCollection.find({}).toArray();
        const totalRevenue = payments.reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0,
        );

        res.send({ totalUsers, totalLawyers, totalHires, totalRevenue });
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch analytics" });
      }
    });

    // 🌟 [HOME PAGE] র‍্যান্ডম ৬ জন Featured Lawyer গেট করার API
    app.get("/featured-lawyers", async (req, res) => {
      try {
        // $sample size: 6 দিলে মঙ্গোডিবি প্রতিবার র‍্যান্ডম ৬টি ডাটা তুলে আনবে
        const result = await servicesCollection
          .aggregate([{ $sample: { size: 6 } }])
          .toArray();
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to fetch featured lawyers", error });
      }
    });

    // 💳 Stripe Hosted Checkout Session API
    app.post("/api/checkout_sessions", async (req, res) => {
      try {
        const { eventId, eventTitle, totalTicketPrice, email } = req.body;

        // ১. স্ট্রাইপ সেশন প্যারামিটার তৈরি
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer_email: email,
          // lawyerEmail: lawyerEmail,

          // পেমেন্ট সফল বা ক্যানসেল হলে ইউজার ফ্রন্টএন্ডের যে ইউআরএল-এ ব্যাক করবে
          success_url: `${process.env.BETTER_AUTH_URL}/dashbroad/user/hiring-history/success?session_id={CHECKOUT_SESSION_ID}&hiringId=${eventId}`,
          cancel_url: `${process.env.BETTER_AUTH_URL}/dashbroad/user/hiring-history/success?payment_cancel=true`,

          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: eventTitle, // যেমন: Lawyer Name বা Consultation Fee
                },
                unit_amount: parseInt(totalTicketPrice * 100), // স্ট্রাইপ সেন্ট হিসেবে হিসাব করে (যেমন: $150 = 15000)
              },
              quantity: 1,
            },
          ],
        });

        // ২. ফ্রন্টএন্ডে স্ট্রাইপ পেজের ইউআরএল রিটার্ন করা
        res.json({ url: session.url });
      } catch (error) {
        console.error("Stripe Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.patch("/api/bookings/update-status", async (req, res) => {
      try {
        const {
          hiringId,
          paymentStatus,
          sessionId,
          clientEmail,
          amount,
          lawyerName,
        } = req.body;
        const { ObjectId } = require("mongodb");

        // ক. মূল বুকিং বা হায়ার রিকোয়েস্টের স্ট্যাটাস 'Paid' করা
        await hiringsCollection.updateOne(
          { _id: new ObjectId(hiringId) },
          { $set: { paymentStatus: paymentStatus } },
        );

        // খ. পেমেন্ট হিস্ট্রি কালেকশনে একটি নতুন রেকর্ড তৈরি করা (যা অ্যাডমিন দেখবে)
        const paymentRecord = {
          hiringId: hiringId,
          sessionId: sessionId,
          clientEmail: clientEmail,
          amount: amount,
          lawyerName: lawyerName,
          status: "Paid",
          createdAt: new Date(),
        };

        await paymentsCollection.insertOne(paymentRecord);

        res.send({
          success: true,
          message: "Status updated and payment record saved!",
        });
      } catch (error) {
        console.error("Error updating system:", error);
        res.status(500).send({ success: false, message: error.message });
      }
    });
    app.get("/admin/payments", async (req, res) => {
      try {
        // ডাটাবেজ থেকে সব পেমেন্ট ডাটা রিড করা (নতুন পেমেন্টগুলো উপরে দেখানোর জন্য sort করা হয়েছে)
        const allPayments = await paymentsCollection
          .find({})
          .sort({ _id: -1 })
          .toArray();

        res.send({
          success: true,
          payments: allPayments,
        });
      } catch (error) {
        console.error("Admin payments fetch error:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal Server Error" });
      }
    });
  } catch (error) {
    console.error("MongoDB Connection Error: ", error);
  }
}

// run() ফাংশন এক্সিকিউট করা
run().catch(console.dir);

// Root API Route
app.get("/", (req, res) => {
  res.send("LegalEase Server is running...");
});

// App Listen
app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
