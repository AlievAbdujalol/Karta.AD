import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

export function calcAvg(reviews) {
  if (!reviews || reviews.length === 0) return 0;
  const sum = reviews.reduce((acc, r) => {
    const cleanliness = Number(r.cleanliness) || 0;
    const politeness = Number(r.politeness) || 0;
    const punctuality = Number(r.punctuality) || 0;
    const score = (cleanliness + politeness + punctuality) / 3;
    return acc + score;
  }, 0);
  return sum / reviews.length;
}

export function validatePhone(phone) {
  if (!phone) return true;
  const PHONE_REGEX = /^\+992\s?\d{2}\s?\d{3}\s?\d{4}$/;
  return PHONE_REGEX.test(phone);
}

export function getGpsColor(accuracy) {
  if (accuracy === null || accuracy === undefined) return 'red';
  if (accuracy <= 20) return 'green';
  if (accuracy <= 50) return 'yellow';
  return 'red';
}

