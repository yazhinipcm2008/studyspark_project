-- StudySpark Migration: Clean up legacy raw-quote questions and remove bogus distractors
-- Ensures existing database questions comply with academic standards

DELETE FROM public.quiz_questions 
WHERE question_text ILIKE 'Which of the following correctly describes:%'
   OR question_text ILIKE 'Explain the concept: "%'
   OR options::text ILIKE '%high-impedance state%'
   OR options::text ILIKE '%asynchronous latch condition%'
   OR options::text ILIKE '%None of the defined operations or states apply%';
