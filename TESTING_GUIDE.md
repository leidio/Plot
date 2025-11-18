# Testing the Create Movement Form

## Prerequisites

1. **Database Setup**: Make sure your PostgreSQL database is running and configured
2. **Environment Variables**: Ensure backend `.env` has:
   - `DATABASE_URL` - PostgreSQL connection string
   - `JWT_SECRET` - Secret key for JWT tokens
   - `PORT` - Backend port (default: 3001)
   - `FRONTEND_URL` - Frontend URL (default: http://localhost:5173)

3. **Frontend Environment**: Ensure frontend has:
   - `VITE_MAPBOX_ACCESS_TOKEN` - Mapbox API token (for geocoding)
   - `VITE_API_URL` - Backend API URL (optional, defaults to http://localhost:3001/api)

## Step-by-Step Testing

### 1. Start the Backend Server

```bash
cd backend
npm install  # if not already done
npm run db:push  # Push database schema (if needed)
npm run dev  # Start backend server
```

You should see:
```
🚀 Plot API running on port 3001
📍 Environment: development
```

### 2. Start the Frontend Server

Open a **new terminal** and run:

```bash
cd frontend
npm install  # if not already done
npm run dev  # Start frontend dev server
```

You should see:
```
VITE v7.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

### 3. Open the Application

Open your browser and navigate to: **http://localhost:5173**

### 4. Create an Account or Sign In

1. Click the **"Sign In"** button in the top right
2. If you don't have an account:
   - Click **"Don't have an account? Sign up"** at the bottom
   - Fill in:
     - First Name
     - Last Name
     - Email
     - Password
   - Click **"Sign Up"**
3. If you already have an account:
   - Enter your email and password
   - Click **"Sign In"**

After successful login, you should see the **"Create"** button appear in the header.

### 5. Create a Movement

1. Click the **"Create"** button (green button with + icon) in the top right
2. Fill out the form:
   - **Movement Name***: e.g., "Green Oakland"
   - **Description***: e.g., "Transforming Oakland through urban agriculture"
   - **City***: e.g., "Oakland"
   - **State***: e.g., "CA" (use 2-letter state code)
   - **Tags** (optional): e.g., "sustainability, climate, urban agriculture" (comma-separated)
3. Click **"Create Movement"**

### 6. What to Expect

- The form will show a loading state ("Creating...")
- The system will geocode your city/state to get coordinates
- If successful:
  - The modal will close
  - The movements list will refresh
  - Your new movement will appear in the list
  - A marker will appear on the map at the location
- If there's an error:
  - An error message will appear in red
  - Check the browser console for details

### 7. Verify in Database (Optional)

You can verify the movement was saved:

```bash
cd backend
npm run db:studio
```

This opens Prisma Studio where you can view the `Movement` table.

## Troubleshooting

### "Access token required" error
- Make sure you're logged in
- Check browser console for authentication errors
- Try logging out and logging back in

### "Could not find location" error
- Make sure city and state are spelled correctly
- Use 2-letter state codes (CA, NY, TX, etc.)
- Check that `VITE_MAPBOX_ACCESS_TOKEN` is set

### "Failed to create movement" error
- Check backend server logs for errors
- Verify database connection
- Check that all required fields are filled

### CORS errors
- Make sure backend `FRONTEND_URL` matches your frontend URL
- Check that backend CORS is configured correctly

### Movements not loading
- Check browser console for API errors
- Verify backend is running on port 3001
- Check that `VITE_API_URL` is set correctly (or defaults to http://localhost:3001/api)

## Testing Checklist

- [ ] Backend server running on port 3001
- [ ] Frontend server running on port 5173
- [ ] Database connected and schema pushed
- [ ] User account created/logged in
- [ ] Create button visible after login
- [ ] Form opens when clicking Create
- [ ] Form validation works (required fields)
- [ ] Geocoding works (city/state to coordinates)
- [ ] Movement saves successfully
- [ ] Movement appears in list after creation
- [ ] Movement marker appears on map

## Example Test Data

**Movement 1:**
- Name: "Green Oakland"
- Description: "Transforming Oakland through urban agriculture and green infrastructure"
- City: "Oakland"
- State: "CA"
- Tags: "sustainability, urban agriculture"

**Movement 2:**
- Name: "Seattle Food Justice"
- Description: "Building food sovereignty in South Seattle neighborhoods"
- City: "Seattle"
- State: "WA"
- Tags: "food justice, equity"

