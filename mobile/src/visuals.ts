import type { ImageSourcePropType } from "react-native";

// Licensed, real photography from Unsplash and Pexels. No generated artwork.
export const photos = {
  hero: { uri: "https://images.pexels.com/photos/34865582/pexels-photo-34865582/free-photo-of-vintage-barbershop-interior-with-empty-chairs.jpeg?auto=compress&cs=tinysrgb&w=1500&q=85" },
  loginHero: { uri: "https://images.pexels.com/photos/17665771/pexels-photo-17665771/free-photo-of-interior-of-a-barber-shop-with-vintage-leather-chairs-and-checkered-floor.jpeg?auto=compress&cs=tinysrgb&w=1200&q=85" },
  haircut: { uri: "https://images.unsplash.com/photo-1747833305853-d43937d88971?auto=format&fit=crop&w=1100&q=85" },
  beard: { uri: "https://images.pexels.com/photos/7518739/pexels-photo-7518739.jpeg?auto=compress&cs=tinysrgb&w=900&q=85" },
  detail: { uri: "https://images.unsplash.com/photo-1737064692469-900adad66656?auto=format&fit=crop&w=1000&q=85" },
  classicCut: { uri: "https://images.pexels.com/photos/2174113/pexels-photo-2174113.jpeg?auto=compress&cs=tinysrgb&w=1100&q=85" },
  woodenTools: { uri: "https://images.pexels.com/photos/12164645/pexels-photo-12164645.jpeg?auto=compress&cs=tinysrgb&w=1000&q=85" },
  razorTools: { uri: "https://images.pexels.com/photos/4730937/pexels-photo-4730937.jpeg?auto=compress&cs=tinysrgb&w=900&q=85" },
  wash: { uri: "https://images.pexels.com/photos/7518730/pexels-photo-7518730.jpeg?auto=compress&cs=tinysrgb&w=1000&q=85" },
  hairColor: { uri: "https://images.pexels.com/photos/4981479/pexels-photo-4981479.jpeg?auto=compress&cs=tinysrgb&w=1000&q=85" },
  perm: { uri: "https://images.pexels.com/photos/28863315/pexels-photo-28863315/free-photo-of-professional-hair-stylist-curling-client-s-hair-in-salon.jpeg?auto=compress&cs=tinysrgb&w=1000&q=85" },
  blowDry: { uri: "https://images.pexels.com/photos/4625625/pexels-photo-4625625.jpeg?auto=compress&cs=tinysrgb&w=1000&q=85" },
  cutClose: { uri: "https://images.pexels.com/photos/19050581/pexels-photo-19050581/free-photo-of-close-up-of-a-man-getting-a-haircut-at-a-barbershop.jpeg?auto=compress&cs=tinysrgb&w=1000&q=85" },
  consultation: { uri: "https://images.pexels.com/photos/3105409/pexels-photo-3105409.jpeg?auto=compress&cs=tinysrgb&w=1100&q=85" },
  chairDetail: { uri: "https://images.pexels.com/photos/12685938/pexels-photo-12685938.jpeg?auto=compress&cs=tinysrgb&w=1000&q=85" }
} as const satisfies Record<string, ImageSourcePropType>;

export function servicePhoto(name: string): ImageSourcePropType {
  if (/râu|cạo|beard|shav/i.test(name)) return photos.beard;
  if (/gội|massage|wash|shampoo|dưỡng|phục hồi/i.test(name)) return photos.wash;
  if (/nhuộm|dye|color/i.test(name)) return photos.hairColor;
  if (/uốn|perm|curl/i.test(name)) return photos.perm;
  return photos.haircut;
}
